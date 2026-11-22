import * as Policy from '../lib/production-policy.mjs';
import {SECTIONS,generalAdmin} from '../lib/section-config.mjs';
const jobs=['Preparador','Gestor','Facilitador','Técnico','Analista','Gerente'];
export async function manageUser({db,u,section,d,path,json,auditStmt}){
 if(u.role!=='admin')return json({error:'Acesso restrito ao administrador.'},403);
 if('password' in d||'email' in d)return json({error:'Credenciais são administradas pelo Keycloak.'},400);
 const assigned=String(d.section||''),general=d.general_admin===true?1:0,name=String(d.name||'').trim(),job=String(d.job||''),role=d.role,turno=String(d.turno||'custom'),times=Policy.SHIFT_DEFS[turno]||{start:d.start,end:d.end},start=times.start,end=times.end;
 if(!SECTIONS.some(x=>x.id===assigned)||assigned!==section&&!generalAdmin(u)||general&&(!generalAdmin(u)||role!=='admin'))return json({error:'Acesso negado à seção ou ao perfil geral.'},403);
 if(!['1','2','3','custom'].includes(turno)||!name||name.length>100||!jobs.includes(job)||!['admin','operador'].includes(role)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start===end)throw Error('Preencha nome, função, perfil e horário corretamente.');
 const selected=d.permissions===undefined?undefined:Policy.normalizePermissions(d.permissions),active=d.active===false?0:1;
 // The provider issuer is always the authenticated, configured realm; it cannot
 // be selected by a browser. No mapping by email or unverified Windows header.
 const issuer=u.oidc_issuer;
 if(path==='/api/users'){
  const username=String(d.username||'').trim(),subject=String(d.oidc_subject||'').trim();
  if(!username||username.length>60||!subject||subject.length>255)throw Error('Informe o usuário e o identificador sub do Keycloak.');
  await db.transaction(async tx=>{
   await tx.prepare('INSERT INTO users(username,oidc_issuer,oidc_subject,name,job,role,start,"end",turno,permissions,active,section,general_admin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(username,issuer,subject,name,job,role,start,end,turno,role==='admin'||selected===undefined?null:JSON.stringify(selected),active,assigned,general).run();
   await auditStmt(tx,u.username,'cadastrou acesso corporativo',null,null,{username,name,job,role,turno,section:assigned,general_admin:general,active},assigned).run();
  });return json({ok:true});
 }
 if(!Number.isSafeInteger(Number(d.id))||Number(d.id)<1)throw Error('Usuário inválido.');
 return db.transaction(async tx=>{
  // Serialize role edits to preserve at least one active general administrator.
  await tx.query('SELECT pg_advisory_xact_lock(17301002)');
  const target=await tx.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').bind(Number(d.id)).first();
  if(!target||target.section!==section||!generalAdmin(u)&&generalAdmin(target))return json({error:'Usuário não encontrado nesta seção.'},404);
  if(d.oidc_subject&&d.oidc_subject!==target.oidc_subject)throw Error('O identificador corporativo é imutável; solicite alteração controlada à TI.');
  if(target.id===u.id&&(!active||role!=='admin'||generalAdmin(u)&&!general))throw Error('Você não pode remover o próprio acesso administrador.');
  if(generalAdmin(target)&&(!general||!active||role!=='admin')&&(await tx.prepare("SELECT COUNT(*) AS n FROM users WHERE general_admin=1 AND role='admin' AND active=1 AND id!=?").bind(target.id).first()).n===0)throw Error('Mantenha ao menos um administrador geral ativo.');
  const permissions=role==='admin'?null:selected===undefined?target.permissions:JSON.stringify(selected),after={username:target.username,name,job,role,start,end,turno,active,section:assigned,general_admin:general,permissions};
  await tx.prepare('UPDATE users SET name=?,job=?,role=?,start=?,"end"=?,turno=?,active=?,section=?,general_admin=?,permissions=? WHERE id=?').bind(name,job,role,start,end,turno,active,assigned,general,permissions,target.id).run();
  await tx.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id).run();
  await auditStmt(tx,u.username,'alterou acesso corporativo',null,{...target,oidc_subject:undefined,oidc_issuer:undefined},after,section).run();
  if(assigned!==target.section)await auditStmt(tx,u.username,'recebeu usuário na seção',null,null,after,assigned).run();
  return json({ok:true});
 });
}
