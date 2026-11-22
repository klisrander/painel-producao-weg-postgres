import {manageUser} from '../server/users.mjs';
import {performanceQuery,performanceRoute} from './performance-config.mjs';
import {projectionRoute,canProject} from './projection/api.mjs';
import * as Policy from './production-policy.mjs';
import {HistoryTools} from './history-workbook.mjs';
import {sectionConfig,sectionFor,sectionView,generalAdmin,SECTIONS} from './section-config.mjs';
import {createHash} from 'node:crypto';
const IDLE_MS=15*60*1000;
export const METAS=Policy.BASE_METAS;
const jobs=['Preparador','Gestor','Facilitador','Técnico','Analista','Gerente'];
const stamp=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace(' ','T');
export function shiftAllowed(u:any,created:string,t=stamp()){return Policy.canEditShift(u,created,t)}

const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const publicUser=(u:any)=>({...Object.fromEntries(['id','username','name','job','role','start','end','active','turno','oidc_subject','section','general_admin'].map(k=>[k,u[k]])),permissions:Policy.effectivePermissions(u),permissions_custom:u.permissions!=null});
const json=(d:any,s=200,h:any={})=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...h}});
const canEvolution=(u:any)=>!!u&&(u.role==='admin'||u.job==='Gerente');
const manageGoals=(u:any)=>Policy.hasPermission(u,'goals.manage');
const canReadKind=(u:any,kind:string)=>Policy.hasPermission(u,'dashboard')||Policy.hasPermission(u,Policy.recordPermission(kind,'history'));
const canEditRecord=(u:any,r:any)=>u.role==='admin'||(Policy.hasPermission(u,Policy.recordPermission(r.kind,'edit'))&&r.owner===u.id&&shiftAllowed(u,r.created));
const validDay=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const readGoalHistory=async(db:any,section:string)=>(await db.prepare('SELECT id,effective_date,line,stage,meta1,meta2,meta3,third_enabled,at,actor FROM goal_changes WHERE section=? ORDER BY effective_date,id').bind(section).all()).results;
const integer=(v:any)=>{if(v===''||!Number.isSafeInteger(Number(v))||Number(v)<0)throw Error('Informe uma quantidade inteira e não negativa.');return Number(v)};
export function stopInterval(fields:any,previous:any=null,currentDay=stamp().slice(0,10),allowDateChoice=false){
 let inicio=String(fields.inicio||'').trim(),fim=String(fields.fim||'').trim();
 if(!inicio&&!fim&&previous&&!previous.inicio&&!previous.fim)return {duracao:integer(previous.duracao)};
 const fixed=['1','2'].includes(String(fields.turno));
 if(fixed){
  const clock=(value:string)=>{const time=/^\d{2}:\d{2}$/.test(value)?value:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?value.slice(11):'';if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Informe as horas de início e de fim da parada.');return time};
  const start=clock(inicio),end=clock(fim),date=allowDateChoice?fields.data:previous?.data||currentDay;
  if(!validDay(date))throw Error('Data da parada inválida.');
  if(previous?.inicio&&previous?.fim&&(!allowDateChoice||date===previous.data)&&String(previous.turno)===String(fields.turno)&&start===previous.inicio.slice(11,16)&&end===previous.fim.slice(11,16)){inicio=previous.inicio;fim=previous.fim}
  else{inicio=date+'T'+start;fim=date+'T'+end}
 }
 const parse=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Informe a data e a hora de início e de fim da parada.');const ms=Date.parse(value+':00Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,16)!==value)throw Error('Data ou horário da parada inválido.');return ms};
 const a=parse(inicio),b=parse(fim);if(b<a)throw Error(fixed?'No 1º e 2º turnos, a hora final deve ser igual ou posterior à inicial no mesmo dia.':'O fim da parada não pode ser anterior ao início. Para paradas após a meia-noite, selecione a data seguinte.');
 return {inicio,fim,duracao:(b-a)/60000};
}
function auditStmt(db:any,actor:string,action:string,rid:any=null,before:any=null,after:any=null,section:any=null){return db.prepare("INSERT INTO audit(at,actor,action,record_id,before_data,after_data,section) VALUES(?,?,?,?,?,?,COALESCE(?,(SELECT section FROM users WHERE username=?),'bobinagem'))").bind(stamp(),actor,action,rid,before===null?null:JSON.stringify(before),after===null?null:JSON.stringify(after),section,actor)}
function panelInfo(u:any,section:string,history:any[],performanceHistory:any[]=[]){
 const config=sectionConfig(section);
 return {session:{now:Date.now(),expires:u.session_expires,id:u.session_hash?hash('activity:'+u.session_hash).slice(0,24):''},performanceHistory,canManagePerformance:Policy.canManagePerformance(u),canProject:canProject(u),canEvolution:canEvolution(u),user:{...publicUser(u),turno:Policy.userShift(u)},metas:config.metas,config:sectionView(config),sections:generalAdmin(u)?SECTIONS:SECTIONS.filter(x=>x.id===u.section),goalHistory:history,canManageGoals:manageGoals(u),catalog:config.catalog,motivos:Policy.MOTIVOS,shifts:Policy.SHIFT_DEFS,spanishAnchor:Policy.SPANISH_ANCHOR};
}
const recordRows=(rows:any[],u:any)=>rows.filter(r=>canReadKind(u,r.kind)).map(r=>({...r,data:JSON.parse(r.data),editable:canEditRecord(u,r)}));
function goalQuery(db:any,section:string){return db.prepare('SELECT id,effective_date,line,stage,meta1,meta2,meta3,third_enabled,at,actor FROM goal_changes WHERE section=? ORDER BY effective_date,id').bind(section)}
function recordsQuery(db:any,section:string){return db.prepare('SELECT r.*,u.username FROM records r JOIN users u ON u.id=r.owner WHERE r.section=? ORDER BY r.id DESC').bind(section)}
async function panelData(db:any,u:any,section:string){
 const [goals,records,performance]=await db.batch([goalQuery(db,section),recordsQuery(db,section),performanceQuery(db,section)]);
 return {...panelInfo(u,section,goals.results,performance.results),records:recordRows(records.results,u)};
}

async function productionBoard(db:any,req:Request,section:string){
 const config=sectionConfig(section);
 const {cts,...publicConfig}=sectionView(config);
  const url=new URL(req.url),from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
  for(const value of [from,to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value))throw Error('Informe uma data válida.');
  if(from&&to&&from>to)throw Error('A data inicial deve ser anterior ou igual à data final.');
  const [result,goals,performance]=await db.batch([db.prepare(`SELECT (data::jsonb->>'data') AS data,(data::jsonb->>'linha') AS linha,(data::jsonb->>'etapa') AS etapa,COALESCE(CAST((data::jsonb->>'turno') AS TEXT),'3') AS turno,SUM(CAST((data::jsonb->>'producao') AS INTEGER)) AS producao FROM records WHERE section=? AND kind='producao' AND (?='' OR (data::jsonb->>'data')>=?) AND (?='' OR (data::jsonb->>'data')<=?) GROUP BY 1,2,3,4 ORDER BY 1,3,2,4`).bind(section,from,from,to,to),goalQuery(db,section),performanceQuery(db,section)]);
  return json({rows:result.results,metas:config.metas,config:publicConfig,performanceHistory:performance.results.map(({actor,at,...r}:any)=>r),goalHistory:goals.results.map(({actor,at,...r}:any)=>r),updatedAt:new Date().toISOString()});
}

export function createApi({db,auth}){return async function api(req:Request){const path=new URL(req.url).pathname;try{
 if(req.method==='GET'&&path==='/api/health'){await db.query('SELECT 1');return json({ok:true,timezone:'America/Sao_Paulo'})}
 if(req.method==='POST'&&(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site'))return json({error:'Origem inválida.'},403);
 const limit=path.startsWith('/api/projection/')?131072:32768;
 if(Number(req.headers.get('content-length')||0)>limit)return json({error:'Solicitação muito grande.'},413);
 let d:any={};
 if(req.method==='POST'){
  if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'Envie os dados como application/json.'},415);
  const chunks:Uint8Array[]=[],reader=req.body?.getReader();let size=0;
  if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();return json({error:'Solicitação muito grande.'},413)}chunks.push(part.value)}
  try{d=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!d||typeof d!=='object'||Array.isArray(d))throw Error()}catch{return json({error:'Envie um objeto JSON válido.'},400)}
 }
 const u=await auth.user(req);if(!u)return json({error:'Entre com sua conta corporativa.'},401);
 if(req.method==='GET'&&['/api/public/bobinagem/production','/api/public/montagem/production','/api/public/montagem-ib/production'].includes(path)){
  const publicSection=path==='/api/public/bobinagem/production'?'bobinagem':path==='/api/public/montagem-ib/production'?'montagem-ib':'montagem';
  const requested=new URL(req.url).searchParams.getAll('section'),header=req.headers.get('X-WEG-Section');
  if(requested.some(value=>value!==publicSection)||(header&&header!==publicSection))return json({error:'Este acompanhamento público é exclusivo da seção '+sectionConfig(publicSection).label+'.'},403);
  if(!canReadKind(u,'producao')||(!generalAdmin(u)&&u.section!==publicSection))return json({error:'Acesso negado à seção.'},403);
  return await productionBoard(db,req,publicSection);
 }

 if(req.method==='POST'&&path==='/api/session/activity'){
  const now=Date.now(),at=Number(d.at);if(!Number.isSafeInteger(at)||at>now+5000||at<now-IDLE_MS)return json({error:'Atividade inválida.'},400);
  const expires=Math.min(now,at)+IDLE_MS;
  const row=await db.prepare('UPDATE sessions SET expires=LEAST(absolute_expires,GREATEST(expires,?)) WHERE token=? AND expires>? AND absolute_expires>0 RETURNING expires').bind(expires,u.session_hash,now).first();
  if(!row)return json({error:'Sessão encerrada por inatividade.'},401);return json({expires:row.expires});
 }
 let section:string;try{section=sectionFor(u,req)}catch{return json({error:'Acesso negado à seção.'},403)}
 const config=sectionConfig(section),metas=config.metas,catalog=config.catalog;
 const audit=(action:string,rid:any,before:any,after:any)=>auditStmt(db,u.username,action,rid,before,after,section);
 if(path==='/api/performance')return await performanceRoute({db,req,path,d,u,section,config,json,at:stamp()});
 if(path.startsWith('/api/projection/')){const at=stamp();return await projectionRoute({path,req,d,db,u,section,config,json,at,today:Policy.operationDate('3',at)})}
 if(req.method==='GET'&&path==='/api/public/production'){
  if(!canReadKind(u,'producao'))return json({error:'Seu usuário não tem permissão para consultar a produção.'},403);
  return await productionBoard(db,req,section);
 }
 if(req.method==='GET'){
 if(path==='/api/management/evolution'){
  if(!canEvolution(u))return json({error:'Evolução dos três turnos disponível para gerentes e administradores.'},403);
  const q=new URL(req.url).searchParams,today=stamp().slice(0,10),from=q.get('from')||today.slice(0,7)+'-01',to=q.get('to')||today,stage=q.get('stage')||config.stages[0],line=q.get('line')||'';
  if(!validDay(from)||!validDay(to)||from>to||(Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000>92)throw Error('Escolha um período válido de até 93 dias.');
  if(!config.stages.includes(stage)||(line&&!config.partsByLine[line]?.includes(stage)))throw Error('Escolha uma etapa e uma linha desta seção.');
  const [data,goals,performance]=await db.batch([db.prepare("SELECT (data::jsonb->>'data') AS date,(data::jsonb->>'linha') AS line,COALESCE(CAST((data::jsonb->>'turno') AS TEXT),'3') AS shift,SUM(CAST((data::jsonb->>'producao') AS INTEGER)) AS production,SUM(CAST((data::jsonb->>'defeitos') AS INTEGER)) AS defects,COUNT(*) AS entries FROM records WHERE section=? AND kind='producao' AND (data::jsonb->>'etapa')=? AND (data::jsonb->>'data')>=? AND (data::jsonb->>'data')<=? AND (?='' OR (data::jsonb->>'linha')=?) GROUP BY 1,2,3 ORDER BY 1,3,2").bind(section,stage,from,to,line,line),goalQuery(db,section),performanceQuery(db,section)]);
  const rows=data.results.filter((r:any)=>['1','2','3'].includes(r.shift)&&config.partsByLine[r.line]?.includes(stage)).map((r:any)=>({...r,...Policy.performanceFor(r.date,stage,r.line,r.shift,performance.results,goals.results,metas)}));
  return json({section,label:config.label,from,to,stage,line,rows,updatedAt:stamp()});
 }
 if(path==='/api/bootstrap')return json(await panelData(db,u,section));
 if(path==='/api/me')return json(panelInfo(u,section,await readGoalHistory(db,section)));
 if(path==='/api/records'){const r=await db.prepare('SELECT r.*,u.username FROM records r JOIN users u ON u.id=r.owner WHERE r.section=? ORDER BY r.id DESC').bind(section).all();return json(r.results.filter((r:any)=>canReadKind(u,r.kind)).map((r:any)=>({...r,data:JSON.parse(r.data),editable:canEditRecord(u,r)})))}
 if(path==='/api/records/export'){
  const q=HistoryTools.query(Object.fromEntries(new URL(req.url).searchParams));
  if(!Policy.hasPermission(u,Policy.recordPermission(q.type,'history'))||!Policy.hasPermission(u,Policy.recordPermission(q.type,'export')))return json({error:'Seu usuário não tem permissão para exportar este histórico.'},403);
  const rows=(await db.prepare('SELECT r.*,u.username FROM records r JOIN users u ON u.id=r.owner WHERE r.kind=? AND r.section=? ORDER BY r.id DESC').bind(q.type,section).all()).results.map((r:any)=>({...r,data:JSON.parse(r.data)}));
  if(q.line&&!config.lines.includes(q.line))throw Error('Linha inválida para esta seção.');
  const file=HistoryTools.workbook(rows,q,{author:u.name||u.username});
  return new Response(file.bytes,{headers:{'Content-Type':file.mime,'Content-Disposition':'attachment; filename="'+file.filename+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path==='/api/users'&&u.role==='admin')return json((await db.prepare('SELECT * FROM users WHERE section=? AND (general_admin=0 OR ?=1) ORDER BY username').bind(section,generalAdmin(u)?1:0).all()).results.map(publicUser));
 if(path==='/api/audit'&&Policy.hasPermission(u,'audit.view'))return json((await db.prepare('SELECT * FROM audit WHERE section=? ORDER BY id DESC LIMIT 1000').bind(section).all()).results);
 if(path==='/api/backup'&&u.role==='admin'){const data:any={};for(const table of ['users','records','audit','goal_changes','performance_changes','projection_plans','projection_revisions'])data[table]=(await db.prepare('SELECT * FROM '+table+' WHERE section=?'+(table==='users'&&!generalAdmin(u)?' AND general_admin=0':'')).bind(section).all()).results;return json(data,200,{'Content-Disposition':'attachment; filename="backup-producao.json"'})}
 }
 if(req.method==='POST'){
 if(path==='/api/goals-batch'){
 if(!manageGoals(u)||section==='bobinagem')return json({error:'Use o cadastro de metas da sua seção.'},403);
 const effective=String(d.effective_date||''),entries=d.entries;
 if(!validDay(effective)||!Array.isArray(entries)||!entries.length||entries.length>20)throw Error('Informe uma data e até 20 linhas ou partes.');
 const history=await readGoalHistory(db,section),seen=new Set(),statements=[];
 const parse=(v:any)=>v===null?null:integer(v);
 for(const item of entries){
  if(!item||typeof item!=='object')throw Error('Meta inválida.');
  const {line,stage}=item,key=stage+'|'+line;
  if(typeof line!=='string'||typeof stage!=='string'||!config.partsByLine[line]?.includes(stage)||seen.has(key))throw Error('Linha ou parte inválida ou repetida.');
  seen.add(key);
  if(!['meta1','meta2','meta3'].every(k=>item[k]===null||typeof item[k]==='number')||typeof item.third_enabled!=='boolean')throw Error('Use peças inteiras, zero ou campo vazio para cada turno.');
  const meta1=parse(item.meta1),meta2=parse(item.meta2),meta3=parse(item.meta3),before=Policy.policyFor(effective,stage,line,history,metas),expected=item.expected;
  if(!expected||!Array.isArray(expected.goals)||expected.goals.length!==3||JSON.stringify(before.goals)!==JSON.stringify(expected.goals)||before.thirdEnabled!==expected.thirdEnabled)return json({error:'Uma meta foi alterada por outro usuário. Recarregue as metas antes de salvar.'},409);
  if(JSON.stringify(before.goals)===JSON.stringify([meta1,meta2,meta3])&&before.thirdEnabled===item.third_enabled)continue;
  const after={effective_date:effective,line,stage,meta1,meta2,meta3,third_enabled:item.third_enabled};
  statements.push(db.prepare('INSERT INTO goal_changes(effective_date,line,stage,meta1,meta2,meta3,third_enabled,at,actor,section) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(effective,line,stage,meta1,meta2,meta3,item.third_enabled?1:0,stamp(),u.username,section),audit('alterou metas e operação do 3º turno',null,{effective_date:effective,line,stage,...before},after));
 }
 if(statements.length)await db.batch(statements);
 return json({ok:true,updated:statements.length/2});
 }
 if(path==='/api/goals'){
 if(!manageGoals(u))return json({error:'Seu usuário não tem permissão para gerenciar metas e o terceiro turno.'},403);
 const line=String(d.line||''),stage=String(d.stage||''),effective=String(d.effective_date||'');
 if(!validDay(effective)||!metas['1'][stage]||!(line in metas['1'][stage]))throw Error('Informe linha, etapa e data de início da meta.');
 const parse=(v:any)=>v===null||v===''?null:integer(v);const meta1=parse(d.meta1),meta2=parse(d.meta2),meta3=parse(d.meta3);if(typeof d.third_enabled!=='boolean')throw Error('Informe se a linha opera no 3º turno.');
 const history=await readGoalHistory(db,section),before=Policy.policyFor(effective,stage,line,history,metas),after={effective_date:effective,line,stage,meta1,meta2,meta3,third_enabled:d.third_enabled};
 await db.batch([db.prepare('INSERT INTO goal_changes(effective_date,line,stage,meta1,meta2,meta3,third_enabled,at,actor,section) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(effective,line,stage,meta1,meta2,meta3,d.third_enabled?1:0,stamp(),u.username,section),audit('alterou metas e operação do 3º turno',null,{effective_date:effective,line,stage,...before},after)]);return json({ok:true});
 }

 if(path==='/api/users'||path==='/api/user-update')return await manageUser({db,u,section,d,path,json,auditStmt});
 if(path==='/api/record'){
 const kind=d.kind,f=d.data;if(!['producao','perturbacao'].includes(kind)||!f)throw Error('Dados inválidos.');if(!Policy.hasPermission(u,Policy.recordPermission(kind,d.id?'edit':'create')))return json({error:'Seu usuário não tem permissão para '+(d.id?'corrigir':'criar')+' este tipo de registro.'},403);let previous:any=null;if(d.id){previous=await db.prepare('SELECT * FROM records WHERE id=? AND section=?').bind(integer(d.id),section).first();if(!previous||previous.kind!==kind)throw Error('Registro não encontrado.');if(!canEditRecord(u,previous))return json({error:'Edição permitida apenas ao autor dentro do turno de criação, ou ao administrador.'},403)}
 const currentDay=stamp().slice(0,10),allowStopDateChoice=u.role==='admin';
 if(kind==='perturbacao'&&['1','2'].includes(String(f.turno))&&!allowStopDateChoice)f.data=previous?JSON.parse(previous.data).data:currentDay;
 if(!validDay(f.data)||!config.lines.includes(f.linha))throw Error('Data ou linha inválida.');let clean:any={data:f.data,linha:f.linha};
 if(kind==='producao'){const turno=String(f.turno),goal=metas[turno]?.[f.etapa]?.[f.linha];if(goal===undefined)throw Error('Turno ou linha não disponível para esta etapa.');const history=await readGoalHistory(db,section),policy=Policy.policyFor(f.data,f.etapa,f.linha,history,metas),old=previous?JSON.parse(previous.data):null,same=old&&old.data===f.data&&old.linha===f.linha&&old.etapa===f.etapa&&String(old.turno||'3')===turno;if(turno==='3'&&!same&&(!policy.thirdEnabled||!Policy.shiftSpec('3',f.data)))throw Error('Esta linha não opera no 3º turno na data selecionada.');const performance=(await performanceQuery(db,section).all()).results,metrics=Policy.performanceFor(f.data,f.etapa,f.linha,turno,performance,history,metas),activeGoal=same?old.meta:metrics.target;const p=integer(f.producao),def=integer(f.defeitos);if(def>p)throw Error('Peças defeituosas não podem exceder a produção.');clean={...clean,etapa:f.etapa,turno,producao:p,defeitos:def,meta:activeGoal,...(same&&old.capacity!=null?{capacity:old.capacity,efficiency_target:old.efficiency_target}:metrics.configured?{capacity:metrics.capacity,efficiency_target:metrics.efficiencyTarget}:{}),...(same&&old.recuperacao_atraso===true?{recuperacao_atraso:true}:{})}}
 else{
 if(config.partsRequiredForStops){if(!(config.partsByLine[f.linha]||[]).includes(f.etapa))throw Error('Selecione uma parte válida para este produto.');clean.etapa=f.etapa}
 const line=f.linha,old=previous?JSON.parse(previous.data):null;const id=String(f.equipamentoId||''),equipment=(catalog as any[]).find(x=>x.id===id&&x.linha===line);
 if(equipment){clean={...clean,equipamentoId:equipment.id,ct:equipment.ct,descricao:equipment.descricao,codigo:equipment.codigo,patrimonio:equipment.patrimonio}}
 else if(old&&!old.equipamentoId&&!id&&old.linha===line){for(const k of ['ct','descricao','codigo','patrimonio'])if(old[k]!==undefined)clean[k]=old[k]}
 else if(line==='Linha 06'&&id==='manual'&&old?.equipamentoId==='manual'&&old.linha===line){const descricao=String(f.descricao||'').trim();if(!descricao||descricao.length>500)throw Error('Informe o equipamento da Linha 06.');clean={...clean,equipamentoId:'manual',ct:Policy.CTS[line],descricao,codigo:String(f.codigo||'').trim().slice(0,60)||null,patrimonio:String(f.patrimonio||'').trim().slice(0,60)||null}}
 else throw Error('Selecione um equipamento pertencente à linha informada.');
 const reason=String(f.motivo||'').trim(),canonical=Policy.MOTIVOS.find(x=>x.toLocaleUpperCase('pt-BR')===reason.toLocaleUpperCase('pt-BR'));if(!canonical&&(!old||reason!==old.motivo))throw Error('Selecione um motivo da lista.');clean.motivo=canonical||reason;
 const comentario=String(f.comentario||'').trim();if(!comentario||comentario.length>500)throw Error('Descreva o problema ou comentário da parada.');clean.comentario=comentario;
 const stopTurno=String(f.turno||'');if(['1','2','3'].includes(stopTurno))clean.turno=stopTurno;else if(!old||old.turno)throw Error('Selecione o turno da perturbação.');const interval=stopInterval(f,old,currentDay,allowStopDateChoice);clean={...clean,...interval};if(interval.inicio)clean.data=Policy.operationDate(stopTurno,interval.inicio);
 }

 const t=stamp();if(previous)await db.batch([db.prepare('UPDATE records SET updated=?,data=? WHERE id=?').bind(t,JSON.stringify(clean),previous.id),audit('editou '+kind,previous.id,JSON.parse(previous.data),clean)]);else await db.transaction(async tx=>{const saved=await tx.prepare('INSERT INTO records(kind,owner,created,updated,data,section) VALUES(?,?,?,?,?,?) RETURNING id').bind(kind,u.id,t,t,JSON.stringify(clean),section).first();await auditStmt(tx,u.username,'criou '+kind,saved.id,null,clean,section).run()});return json({ok:true})
 }
 }
 return json({error:'Não encontrado.'},404);
 }catch(err:any){
 if(err.code==='40001'||err.code==='23505')return json({error:'Registro alterado em outra sessão ou identificação já cadastrada. Recarregue e tente novamente.'},409);
 if(err.code&&/^\w{5}$/.test(err.code)){console.error('Database request failed',path,err.code);return json({error:'Não foi possível acessar os dados.'},503)}
 return json({error:String(err.message||'Dados inválidos.')},400);
 }}}
