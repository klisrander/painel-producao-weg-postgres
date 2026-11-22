import {pathToFileURL} from 'node:url';
import {connectDatabase} from '../db/postgres.mjs';
import {SECTIONS} from '../lib/section-config.mjs';
export async function provision(db,input){
 const {username,issuer,subject,name=username,job='Gestor',section='bobinagem',role='admin',general=false,legacyId}=input;
 if(!username||username.length>60||!name||!subject||subject.length>255||!issuer||!SECTIONS.some(x=>x.id===section)||!['admin','operador'].includes(role)||general&&role!=='admin')throw Error('Invalid corporate account');
 const parsed=new URL(issuer);if(parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Invalid issuer');
 return db.transaction(async tx=>{
  if(legacyId){
   if(!Number.isSafeInteger(Number(legacyId))||Number(legacyId)<1)throw Error('Invalid legacy id');
   const row=await tx.prepare('UPDATE users SET oidc_issuer=?,oidc_subject=?,active=1 WHERE id=? AND username=? RETURNING id').bind(issuer,subject,Number(legacyId),username).first();if(!row)throw Error('Historical account not found');
   await tx.prepare('DELETE FROM sessions WHERE user_id=?').bind(row.id).run();return row;
  }
  return tx.prepare('INSERT INTO users(username,oidc_issuer,oidc_subject,name,job,section,role,general_admin,start,"end",turno,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,1) RETURNING id').bind(username,issuer,subject,name,job,section,role,general?1:0,'05:00','14:17','1').first();
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=k=>args[args.indexOf('--'+k)+1],db=connectDatabase();
 try{const value=k=>args.includes('--'+k)?get(k):undefined;await provision(db,{username:value('username'),issuer:process.env.OIDC_ISSUER,subject:value('subject'),name:value('name'),job:value('job'),section:value('section'),role:value('role'),general:args.includes('--general-admin'),legacyId:value('legacy-id')});console.log('Corporate account provisioned.')}finally{await db.close()}
}
