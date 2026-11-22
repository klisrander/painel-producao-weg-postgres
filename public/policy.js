const goals=(bob,ins)=>({'Bobinagem':Object.fromEntries(bob.map((v,i)=>['Linha 0'+(i+1),v])),'Inserção':Object.fromEntries(ins.map((v,i)=>['Linha 0'+(i+1),v]))});
const BASE_METAS={'1':goals([null,null,null,null,null],[null,null,null,null,null,null]),'2':goals([null,null,null,null,null],[null,null,null,null,null,null]),'3':goals([null,null,null,null,null],[null,null,null,null,null,null])}
const MOTIVOS=['AJUSTE - MAQ ou FERR','DDS','ELEVADOR TRAVANDO','FALTA DE FERRAMENTA','FALTA DE MATERIAL COMPRADO','FALTA DE MATERIAL MANUFATURADO','FALTA DE OPERADOR','FALTA DE PROGRAMAÇÃO','KAIZEN EM TESTE','LIMPEZA','LOTE PILOTO/AMOSTRA/PROTÓTIPO','MANUTENÇÃO','NÃO LIGA','PREPARAÇÃO','QUALIDADE','REUNIÃO','TREINAMENTO','OUTROS'];
const CTS=Object.fromEntries(Array.from({length:6},(_,i)=>['Linha 0'+(i+1),'CT-'+(i+1)]));
const SHIFT_DEFS={'1':{start:'05:00',end:'14:17'},'2':{start:'14:18',end:'23:23'},'3':{start:'23:24',end:'04:59'}};
const SPANISH_ANCHOR='2026-11-08';
function addDays(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
function shiftSpec(turno,day){const base=SHIFT_DEFS[String(turno)];if(!base)return null;if(String(turno)==='3'&&new Date(day+'T12:00:00Z').getUTCDay()===0){const n=Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(SPANISH_ANCHOR+'T12:00:00Z'))/86400000);return n%14===0?{start:'22:24',end:'05:00',spanish:true}:null}return {...base,spanish:false}}
function shiftWindow(turno,day){const spec=shiftSpec(turno,day);if(!spec)return null;return {...spec,start:day+'T'+spec.start+':00',end:(spec.end<spec.start?addDays(day,1):day)+'T'+spec.end+':59'}}
function userShift(u){if(u.turno==='custom')return 'custom';if(['1','2','3'].includes(String(u.turno)))return String(u.turno);return Object.keys(SHIFT_DEFS).find(k=>SHIFT_DEFS[k].start===u.start&&SHIFT_DEFS[k].end===u.end)||'custom'}
function editingWindow(u,now){const date=now.slice(0,10),turno=userShift(u);for(const day of [date,addDays(date,-1)]){const w=turno==='custom'?{start:day+'T'+u.start+':00',end:(u.end<u.start?addDays(day,1):day)+'T'+u.end+':59'}:shiftWindow(turno,day);if(w&&now>=w.start&&now<=w.end)return w}return null}
function canEditShift(u,created,now){const w=editingWindow(u,now);return !!w&&created>=w.start&&created<=w.end}
function operationDate(turno,datetime){const t=datetime.length===16?datetime+':00':datetime,date=t.slice(0,10);for(const day of [date,addDays(date,-1)]){const w=shiftWindow(turno,day);if(w&&t>=w.start&&t<=w.end)return day}return date}
function policyFor(date,stage,line,history=[],base=BASE_METAS){const goals=[1,2,3].map(t=>base[String(t)]?.[stage]?.[line]??null);let thirdEnabled=!(stage==='Bobinagem'&&line==='Linha 05');for(const r of [...history].sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.id-b.id)){if(r.effective_date<=date&&r.stage===stage&&r.line===line){goals[0]=r.meta1;goals[1]=r.meta2;goals[2]=r.meta3;thirdEnabled=!!r.third_enabled}}return {goals,thirdEnabled}}
function targetFor(date,stage,line,turno,history=[],base=BASE_METAS){const p=policyFor(date,stage,line,history,base);if(String(turno)==='3'&&(!p.thirdEnabled||!shiftSpec('3',date)))return 0;return p.goals[Number(turno)-1]??null}
function canManagePerformance(u){return !!u&&(u.role==='admin'||['Gestor','Analista','Gerente'].includes(u.job))}
function performanceSetting(date,stage,line,turno,history=[]){return history.filter(r=>r.effective_date<=date&&r.stage===stage&&r.line===line&&String(r.turno)===String(turno)).sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||b.id-a.id)[0]||null}
function performanceFor(date,stage,line,turno,history=[],goals=[],base=BASE_METAS){
 const setting=performanceSetting(date,stage,line,turno,history),off=String(turno)==='3'&&(!policyFor(date,stage,line,goals,base).thirdEnabled||!shiftSpec('3',date)),configured=Number.isFinite(setting?.capacity)&&Number.isFinite(setting?.efficiency_target),capacity=configured?(off?0:setting.capacity):null,efficiencyTarget=configured?setting.efficiency_target:null;
 return {configured,off,capacity,efficiencyTarget,target:configured?(off?0:Math.ceil(capacity*efficiencyTarget/100)):targetFor(date,stage,line,turno,goals,base),effectiveDate:setting?.effective_date||null,revision:setting?.id||0};
}
function efficiency(production,capacity){return capacity>0?production/capacity*100:null}
const PERMISSIONS=[
 {key:'dashboard',group:'Visão geral',label:'Ver o resumo do dia',description:'Consultar produções e ocorrências de todas as linhas no painel.'},
 {key:'production.create',group:'Produção',label:'Lançar produção',description:'Registrar quantidades nas etapas da sua seção.'},
 {key:'production.history',group:'Produção',label:'Consultar histórico de produção',description:'Visualizar os lançamentos de todas as linhas e filtrar por período.'},
 {key:'production.edit',group:'Produção',label:'Corrigir a própria produção',description:'Editar seus registros durante o turno de criação.',requires:'production.history'},
 {key:'production.export',group:'Produção',label:'Baixar produção em Excel',description:'Exportar os registros selecionados no histórico.',requires:'production.history'},
 {key:'disturbances.create',group:'Perturbações',label:'Registrar perturbações',description:'Apontar equipamento, motivo e horários da parada.'},
 {key:'disturbances.history',group:'Perturbações',label:'Consultar histórico de perturbações',description:'Visualizar as ocorrências de todas as linhas e filtrar por período.'},
 {key:'disturbances.edit',group:'Perturbações',label:'Corrigir as próprias perturbações',description:'Editar seus registros durante o turno de criação.',requires:'disturbances.history'},
 {key:'disturbances.export',group:'Perturbações',label:'Baixar perturbações em Excel',description:'Exportar as ocorrências selecionadas no histórico.',requires:'disturbances.history'},
 {key:'goals.manage',group:'Gestão',label:'Gerenciar metas e 3º turno',description:'Alterar metas por linha e definir a operação no terceiro turno.'},
 {key:'audit.view',group:'Gestão',label:'Consultar auditoria',description:'Ver quem alterou dados, quando e quais informações foram modificadas.'}
];
function defaultPermissions(u){const p=PERMISSIONS.filter(x=>!['goals.manage','audit.view'].includes(x.key)).map(x=>x.key);if(['Gestor','Analista','Gerente'].includes(u.job))p.push('goals.manage');return p}
function normalizePermissions(value){if(!Array.isArray(value)||value.length>PERMISSIONS.length||value.some(k=>typeof k!=='string'||!PERMISSIONS.some(p=>p.key===k)))throw Error('Selecione permissões válidas.');const selected=new Set(value);for(const p of PERMISSIONS)if(selected.has(p.key)&&p.requires&&!selected.has(p.requires))throw Error('Para '+p.label.toLowerCase()+', habilite a consulta do respectivo histórico.');return PERMISSIONS.filter(p=>selected.has(p.key)).map(p=>p.key)}
function effectivePermissions(u){if(u.role==='admin')return PERMISSIONS.map(x=>x.key);if(u.permissions==null)return defaultPermissions(u);try{return normalizePermissions(typeof u.permissions==='string'?JSON.parse(u.permissions):u.permissions)}catch{return []}}
function hasPermission(u,key){return !!u&&effectivePermissions(u).includes(key)}
function recordPermission(kind,action){return (kind==='producao'?'production':'disturbances')+'.'+action}
const ProductionPolicy={PERMISSIONS,defaultPermissions,normalizePermissions,effectivePermissions,hasPermission,recordPermission,canManagePerformance,performanceSetting,performanceFor,efficiency,BASE_METAS,MOTIVOS,CTS,SHIFT_DEFS,SPANISH_ANCHOR,addDays,shiftSpec,shiftWindow,userShift,editingWindow,canEditShift,operationDate,policyFor,targetFor};

globalThis.ProductionPolicy=ProductionPolicy;
