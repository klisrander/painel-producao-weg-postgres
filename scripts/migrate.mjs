import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {connectDatabase} from '../db/postgres.mjs';
export async function migrate(db){
 await db.transaction(async(tx,client)=>{
  await client.query('SELECT pg_advisory_xact_lock(17301001)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir(new URL('../db/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
   const sql=await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
   const old=(await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name])).rows[0];
   if(old){if(old.checksum!==checksum)throw Error('Applied migration has changed: '+name);continue}
   await client.query(sql);await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
  }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const db=connectDatabase();try{await migrate(db);console.log('PostgreSQL migrations applied.')}finally{await db.close()}}
