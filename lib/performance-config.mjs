import {canManagePerformance,performanceSetting} from './production-policy.mjs';
export const performanceQuery=(db,section)=>db.prepare('SELECT id,effective_date,line,stage,turno,capacity,efficiency_target,at,actor FROM performance_changes WHERE section=? ORDER BY effective_date,id').bind(section);
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export async function performanceRoute({db,req,path,d,u,section,config,json,at}){
 if(path!=='/api/performance')return null;
 if(!canManagePerformance(u))return json({error:'Edição de CAP e eficiência disponível somente para gestor, analista, gerente e administrador.'},403);
 const history=(await performanceQuery(db,section).all()).results;
 if(req.method==='GET')return json({history});
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 if(!validDate(d.effective_date)||d.effective_date<at.slice(0,10)||!['1','2','3'].includes(String(d.turno))||!Array.isArray(d.entries)||!d.entries.length||d.entries.length>100)throw Error('Informe vigência, turno e configurações válidas.');
 const commands=[],seen=new Set();
 for(const entry of d.entries){
  const {line,stage}=entry,key=line+'|'+stage;if(!config.partsByLine[line]?.includes(stage)||seen.has(key))throw Error('Linha ou etapa inválida/repetida para esta seção.');seen.add(key);
  const capacity=entry.capacity==null||entry.capacity===''?null:entry.capacity,target=entry.efficiency_target==null||entry.efficiency_target===''?null:entry.efficiency_target;
  if((capacity===null)!==(target===null)||capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<0||capacity>1000000000||!Number.isFinite(target)||target<0||target>100))throw Error('Preencha CAP inteira não negativa e meta de eficiência entre 0% e 100%, ou deixe ambos vazios.');
  const previous=performanceSetting(d.effective_date,stage,line,d.turno,history);
  if(!Number.isSafeInteger(entry.expected_revision)||(previous?.id||0)!==entry.expected_revision)return json({error:'Configuração alterada em outra sessão. Recarregue antes de salvar.'},409);
  if((previous?.capacity??null)===capacity&&(previous?.efficiency_target??null)===target)continue;
  // The NOT NULL timestamp guard makes a stale concurrent batch roll back in full.
  commands.push(db.prepare('INSERT INTO performance_changes(section,effective_date,line,stage,turno,capacity,efficiency_target,at,actor) VALUES(?,?,?,?,?,?,?,CASE WHEN COALESCE((SELECT id FROM performance_changes WHERE section=? AND line=? AND stage=? AND turno=? AND effective_date<=? ORDER BY effective_date DESC,id DESC LIMIT 1),0)=? THEN ? ELSE NULL END,?)').bind(section,d.effective_date,line,stage,String(d.turno),capacity,target,section,line,stage,String(d.turno),d.effective_date,entry.expected_revision,at,u.username));
  commands.push(db.prepare('INSERT INTO audit(at,actor,action,before_data,after_data,section) VALUES(?,?,?,?,?,?)').bind(at,u.username,'alterou CAP e meta de eficiência',JSON.stringify(previous),JSON.stringify({effective_date:d.effective_date,line,stage,turno:String(d.turno),capacity,efficiency_target:target}),section));
 }
 if(!commands.length)return json({ok:true,updated:0});
 try{await db.batch(commands)}catch(error){if(error.code==='40001'||error.code==='23502')return json({error:'Configuração alterada em outra sessão. Recarregue antes de salvar.'},409);throw error}
 return json({ok:true,updated:commands.length/2});
}
