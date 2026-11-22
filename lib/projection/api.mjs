import {projectionWorkbook} from './xlsx.mjs';
import {normalizePlan,project,exportCsv,includeRecoveryDates} from './math.mjs';
export const canProject=u=>u?.role==='admin'||['Gestor','Gerente'].includes(u?.job);
const parse=r=>r?{...r,data:JSON.parse(r.data)}:null;
const planSelect=(db,id,section)=>db.prepare('SELECT * FROM projection_plans WHERE id=? AND section=?').bind(id,section).first();
async function detail(db,plan,today){
 const end=plan.data.rows.at(-1).date,line=plan.data.line||'';
 const rows=(await db.prepare("SELECT (data::jsonb->>'data') AS day,SUM(CAST((data::jsonb->>'producao') AS INTEGER)) AS production,SUM(CAST((data::jsonb->>'defeitos') AS INTEGER)) AS defects,SUM(CASE WHEN (data::jsonb->>'recuperacao_atraso')='true' THEN CAST((data::jsonb->>'producao') AS INTEGER) ELSE 0 END) AS recovery_production,SUM(CASE WHEN (data::jsonb->>'recuperacao_atraso')='true' THEN CAST((data::jsonb->>'defeitos') AS INTEGER) ELSE 0 END) AS recovery_defects,SUM(CASE WHEN (data::jsonb->>'recuperacao_atraso')='true' THEN 1 ELSE 0 END) AS recovery_count,COUNT(*) AS count,STRING_AGG(DISTINCT COALESCE((data::jsonb->>'turno'),'3'), ',') AS shifts FROM records WHERE section=? AND kind='producao' AND (data::jsonb->>'etapa')=? AND (data::jsonb->>'data')>=? AND (data::jsonb->>'data')<=? AND (?='' OR (data::jsonb->>'linha')=?) GROUP BY 1").bind(plan.section,plan.stage,plan.start_date,end,line,line).all()).results;
 const panel=Object.fromEntries(rows.map(r=>[r.day,{production:Number(r.production),defects:Number(r.defects)||0,count:r.count,shifts:r.shifts,recoveryProduction:Number(r.recovery_production)||0,recoveryDefects:Number(r.recovery_defects)||0,recoveryCount:Number(r.recovery_count)||0}]));plan=includeRecoveryDates(plan,panel);return {plan,panel,projection:project(plan,panel,today),today};
}
async function persist({db,u,section,config,json,at,input,previous=null,newId=null,source=null}){
 const normalized=normalizePlan(input,config,previous);if(source)normalized.data.source=source;const id=newId||previous?.id||globalThis.crypto.randomUUID(),revision=previous?previous.revision+1:1;
 const plan={id,section,...normalized,revision,created:previous?.created||at,updated:at,actor:u.username},encoded=JSON.stringify(plan);
 return db.transaction(async tx=>{
  let saved;
  if(previous)saved=await tx.prepare('UPDATE projection_plans SET name=?,stage=?,start_date=?,initial_backlog=?,data=?,revision=revision+1,updated=?,actor=? WHERE id=? AND section=? AND revision=? RETURNING id').bind(plan.name,plan.stage,plan.start_date,plan.initial_backlog,JSON.stringify(plan.data),at,u.username,id,section,previous.revision).first();
  else saved=await tx.prepare('INSERT INTO projection_plans(id,section,name,stage,start_date,initial_backlog,revision,data,created,updated,actor) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(id,section,plan.name,plan.stage,plan.start_date,plan.initial_backlog,revision,JSON.stringify(plan.data),at,at,u.username).first();
  if(!saved)return json({error:'Este plano foi alterado em outra sessão. Recarregue antes de salvar.'},409);
  await tx.prepare('INSERT INTO projection_revisions(plan_id,section,revision,at,actor,snapshot) VALUES(?,?,?,?,?,?)').bind(id,section,revision,at,u.username,encoded).run();
  await tx.prepare('INSERT INTO audit(at,actor,action,record_id,before_data,after_data,section) VALUES(?,?,?,NULL,?,?,?)').bind(at,u.username,previous?'alterou projeção Zero Atraso':'criou projeção Zero Atraso',previous?JSON.stringify(previous):null,encoded,section).run();
  return json({ok:true,plan});
 });
}
export async function projectionRoute({path,req,d,db,u,section,config,json,at,today}){
 if(!path.startsWith('/api/projection/'))return null;
 if(!canProject(u))return json({error:'Projeção Zero Atraso disponível somente para administradores, gestores e gerentes.'},403);
 const url=new URL(req.url),id=req.method==='GET'?url.searchParams.get('id'):d.id;
 if(req.method==='GET'&&path==='/api/projection/plans'){
  const archived=url.searchParams.get('archived')==='1';const rows=(await db.prepare("SELECT id,name,stage,start_date,initial_backlog,revision,updated,actor,CASE WHEN (data::jsonb->>'archived')='true' THEN 1 ELSE 0 END AS archived FROM projection_plans WHERE section=? AND (?=1 OR CASE WHEN (data::jsonb->>'archived')='true' THEN 1 ELSE 0 END=0) ORDER BY updated DESC,id LIMIT 200").bind(section,archived?1:0).all()).results;return json({plans:rows,today});
 }
 let previous=id?parse(await planSelect(db,String(id),section)):null;
 if(id&&!previous)return json({error:'Plano não encontrado nesta seção.'},404);
 if(req.method==='GET'&&path==='/api/projection/plan'&&previous)return json(await detail(db,previous,today));
 if(req.method==='GET'&&path==='/api/projection/export'&&previous){const result=await detail(db,previous,today);return new Response(exportCsv(previous,result.projection),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="projecao-zero-atraso.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
 if(req.method==='GET'&&path==='/api/projection/history'&&previous)return json({history:(await db.prepare('SELECT revision,at,actor FROM projection_revisions WHERE plan_id=? AND section=? ORDER BY revision DESC LIMIT 100').bind(id,section).all()).results});
 if(req.method==='POST'&&path==='/api/projection/export-xlsx'){
  if(JSON.stringify(d).length>131072)return json({error:'Plano muito grande.'},413);
  const input={...normalizePlan(d,config,previous),id:previous?.id,revision:d.revision||previous?.revision,section},primary=await detail(db,input,today);let comparison=null;
  if(d.compare_id){const other=parse(await planSelect(db,String(d.compare_id),section));if(!other)return json({error:'Cenário de comparação não encontrado nesta seção.'},404);if(d.compare_revision!=null&&Number(d.compare_revision)!==other.revision)return json({error:'O cenário de comparação mudou. Atualize a comparação antes de exportar.'},409);comparison=await detail(db,other,today)}
  const output=projectionWorkbook(primary,comparison,{sectionLabel:config.label,author:u.name||u.username,draft:!previous||d.draft===true});return new Response(output.bytes,{headers:{'Content-Type':output.mime,'Content-Disposition':'attachment; filename="'+output.filename+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(req.method==='POST'){
  if(JSON.stringify(d).length>131072)return json({error:'Plano muito grande.'},413);
  if(previous&&(!Number.isInteger(d.revision)||d.revision!==previous.revision))return json({error:'Este plano foi alterado em outra sessão. Recarregue antes de salvar.'},409);
  if(path==='/api/projection/preview'){const normalized=normalizePlan(d,config,previous,{preview:true});return json(await detail(db,{...normalized,section},today))}
  if(path==='/api/projection/save')return persist({db,u,section,config,json,at,input:d,previous});
  if(path==='/api/projection/archive'&&previous)return persist({db,u,section,config,json,at,input:{...previous,data:{...previous.data,archived:d.archived===true}},previous});
  if(path==='/api/projection/clone'&&previous){
   let original=previous;
   if(d.from_revision!=null){const r=await db.prepare('SELECT snapshot FROM projection_revisions WHERE plan_id=? AND section=? AND revision=?').bind(id,section,Number(d.from_revision)).first();if(!r)return json({error:'Versão não encontrada.'},404);original=JSON.parse(r.snapshot)}
   const input={...original,name:String(d.name||'Cópia · '+original.name).slice(0,100),data:{...original.data,archived:false}};
   return persist({db,u,section,config,json,at,input,previous:null,newId:globalThis.crypto.randomUUID(),source:original.data.source});
  }
 }
 return json({error:'Operação de planejamento não encontrada.'},404);
}
