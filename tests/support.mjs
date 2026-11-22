import {randomUUID,createHash} from 'node:crypto';
import {connectDatabase} from '../db/postgres.mjs';
import {migrate} from '../scripts/migrate.mjs';
import {createAuth} from '../server/auth.mjs';
import {createApplication} from '../server/index.ts';
export const testUrl=process.env.TEST_DATABASE_URL;
export async function fixture(t,{config:override={}}={}){
 if(!testUrl)throw Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database');
 const root=connectDatabase({DATABASE_URL:testUrl}),schema='weg_test_'+randomUUID().replaceAll('-','');await root.query('CREATE SCHEMA '+schema);
 const url=new URL(testUrl);url.searchParams.set('options','-csearch_path='+schema);const db=connectDatabase({DATABASE_URL:url.href});await migrate(db);
 t.after(async()=>{await db.close();await root.query('DROP SCHEMA '+schema+' CASCADE');await root.close()});
 const config={origin:'https://panel.example.test',issuer:'https://identity.example.test/realms/test',clientId:'synthetic-client',clientSecret:'synthetic-test-only',secure:true,allowLoopback:false,sessionMaxMs:8*3600000,...override};
 const auth=createAuth({db,config}),handle=createApplication({db,config,auth});
 async function person({username='synthetic_admin',role='admin',job='Gestor',section='bobinagem',general_admin=1,permissions=null,subject=username,active=1}={}){
  const token=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''),hash=createHash('sha256').update(token).digest('hex');
  const row=await db.prepare('INSERT INTO users(username,oidc_issuer,oidc_subject,name,job,role,start,"end",turno,section,general_admin,permissions,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *').bind(username,config.issuer,subject,'Pessoa de teste',job,role,'00:00','23:59','custom',section,general_admin,permissions?JSON.stringify(permissions):null,active).first();
  await db.prepare('INSERT INTO sessions(token,user_id,expires,absolute_expires) VALUES(?,?,?,?)').bind(hash,row.id,Date.now()+900000,Date.now()+8*3600000).run();return {...row,token,hash,cookie:auth.cookieName+'='+token};
 }
 async function request(path,{as,data,method=data?'POST':'GET',headers={}}={}){
  const response=await handle(new Request(config.origin+path,{method,headers:{...(data?{'content-type':'application/json',origin:config.origin}:{}),...(as?{cookie:as.cookie}:{}),...headers},body:data?JSON.stringify(data):undefined}));const contentType=response.headers.get('content-type')||'';let body;if(contentType.includes('application/json'))body=await response.json();else if(contentType.includes('application/vnd'))body=new Uint8Array(await response.arrayBuffer());else body=await response.text();return {status:response.status,body,headers:response.headers};
 }
 return {db,config,auth,handle,person,request,schema};
}
