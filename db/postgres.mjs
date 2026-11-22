import pg from 'pg';
import {readFileSync} from 'node:fs';
// PostgreSQL bigint/numeric values used by this application fit JS safe integers
// (ids are int4; expiry values are milliseconds). Reject unsafe integer values.
pg.types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Integer out of range');return n});
pg.types.setTypeParser(1700,value=>Number(value));

export function parameters(sql){
 let result='',count=0,quote=null;
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(quote){result+=c;if(c===quote){if(sql[i+1]===quote)result+=sql[++i];else quote=null}continue}
  if(c==='\''||c==='"'){quote=c;result+=c}
  else result+=c==='?'?'$'+(++count):c;
 }
 return {sql:result,count};
}
export function database(pool){
 function prepare(sql){const translated=parameters(sql);let values=[];
  const statement={sql:translated.sql,get values(){return values},bind(...args){if(args.length!==translated.count)throw Error('SQL parameter count mismatch');values=args;return statement},async all(){return result(await pool.query(translated.sql,values))},async first(){return (await statement.all()).results[0]||null},async run(){return statement.all()}};
  return statement;
 }
 function result(r){return {results:r.rows,meta:{changes:r.rowCount||0}}}
 async function transaction(fn){const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const tx=database({query:(...args)=>client.query(...args),connect:()=>{throw Error('Nested transactions are unsupported')}});const output=await fn(tx,client);await client.query('COMMIT');return output}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 return {prepare,query:(sql,values=[])=>pool.query(sql,values),transaction,batch:statements=>transaction(async(_,client)=>{const output=[];for(const s of statements)output.push(result(await client.query(s.sql,s.values)));return output}),close:()=>pool.end?.()};
}
export function connectDatabase(env=process.env){
 if(!env.DATABASE_URL)throw Error('Configure DATABASE_URL');
 const ssl=env.PGSSLROOTCERT?{ca:readFileSync(env.PGSSLROOTCERT,'utf8'),rejectUnauthorized:true}:undefined;
 return database(new pg.Pool({connectionString:env.DATABASE_URL,max:10,ssl,statement_timeout:15000,idle_in_transaction_session_timeout:15000,application_name:'painel-producao'}));
}
