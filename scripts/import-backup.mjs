import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {connectDatabase} from '../db/postgres.mjs';
const sections=new Set(['bobinagem','montagem','montagem-ib']);
const columns={
 records:['id','section','kind','owner','created','updated','data'],
 audit:['id','section','at','actor','action','record_id','before_data','after_data'],
 goal_changes:['id','section','effective_date','line','stage','meta1','meta2','meta3','third_enabled','at','actor'],
 performance_changes:['id','section','effective_date','line','stage','turno','capacity','efficiency_target','at','actor'],
 projection_plans:['id','section','name','stage','start_date','initial_backlog','revision','data','created','updated','actor'],
 projection_revisions:['id','plan_id','section','revision','at','actor','snapshot']
};
const userColumns=['id','username','oidc_issuer','oidc_subject','name','job','role','start','end','active','turno','section','general_admin','permissions'];
const forbidden=new Set(['password','salt','hash','email','code_hash','token','refresh_token','access_token','id_token']);
function scrub(value){if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!forbidden.has(k)).map(([k,v])=>[k,scrub(v)]));return value}
export async function importBackup(db,backups,{issuer,identities=[],apply=false}={}){
 if(!issuer)throw Error('Configure the target OIDC issuer');
 const sets=Object.fromEntries(['users',...Object.keys(columns)].map(k=>[k,new Map()]));
 for(const backup of backups)for(const [table,map]of Object.entries(sets)){
  if(!Array.isArray(backup[table]))throw Error('Backup lacks table '+table);
  for(const raw of backup[table]){
   if(!sections.has(raw.section))throw Error('Invalid backup section');const row={...raw};
   if(table==='users')for(const key of forbidden)delete row[key];
   if(table==='audit')for(const key of ['before_data','after_data'])if(row[key]){try{row[key]=JSON.stringify(scrub(JSON.parse(row[key])))}catch{throw Error('Invalid audit snapshot')}}
   const previous=map.get(row.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(row))throw Error('Conflicting backup rows');map.set(row.id,row);
  }
 }
 const counts=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.size]));
 const links=new Map();for(const entry of identities){if(!Number.isSafeInteger(entry.legacy_id)||!entry.subject||entry.subject.length>255||links.has(entry.legacy_id))throw Error('Invalid identity mapping');links.set(entry.legacy_id,entry.subject)}
 const subjects=[...links.values()];if(new Set(subjects).size!==subjects.length)throw Error('Identity reused for multiple users');
 // Validate every record/plan/snapshot before opening a transaction.
 for(const r of sets.records.values()){if(!sets.users.has(r.owner))throw Error('Record owner absent from backup');JSON.parse(r.data)}
 for(const r of sets.projection_plans.values())JSON.parse(r.data);
 for(const r of sets.projection_revisions.values()){if(!sets.projection_plans.has(r.plan_id))throw Error('Plan missing from backup');JSON.parse(r.snapshot)}
 if(!apply)return {dryRun:true,counts,linkedUsers:links.size};
 await db.transaction(async(tx,client)=>{
  await client.query('SELECT pg_advisory_xact_lock(17301003)');
  for(const table of Object.keys(sets)){if((await client.query('SELECT COUNT(*) AS n FROM '+table)).rows[0].n)throw Error('Import requires empty destination tables')}
  async function insert(table,row,keys){await client.query('INSERT INTO '+table+'('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(k=>row[k]??null))}
  for(const raw of sets.users.values()){
   const subject=links.get(raw.id),row={...raw,oidc_issuer:issuer,oidc_subject:subject||'unlinked-history:'+raw.id,active:subject?raw.active:0};
   await insert('users',row,userColumns);
  }
  for(const [table,keys]of Object.entries(columns))for(const row of sets[table].values())await insert(table,row,keys);
  // Preserve imported numeric identifiers while advancing each sequence.
  for(const table of ['users','records','audit','goal_changes','performance_changes','projection_revisions'])await client.query("SELECT setval(pg_get_serial_sequence('"+table+"','id'),COALESCE((SELECT MAX(id) FROM "+table+"),1),EXISTS(SELECT 1 FROM "+table+"))");
 });return {dryRun:false,counts,linkedUsers:links.size};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),files=args.filter((v,i)=>args[i-1]==='--backup'),index=args.indexOf('--identities');if(!files.length)throw Error('Use --backup path for each section');
 const backups=await Promise.all(files.map(p=>readFile(p,'utf8').then(JSON.parse))),identities=index>=0?JSON.parse(await readFile(args[index+1],'utf8')).users:[],db=connectDatabase();
 try{console.log(JSON.stringify(await importBackup(db,backups,{issuer:process.env.OIDC_ISSUER,identities,apply:args.includes('--apply')})))}finally{await db.close()}
}
