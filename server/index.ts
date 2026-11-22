import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {connectDatabase} from '../db/postgres.mjs';
import {createApi} from '../lib/production-api';
import {configuration} from './config.mjs';
import {createAuth,safeReturn} from './auth.mjs';
import {secureResponse} from './security.mjs';
import {BASE_METAS} from '../lib/production-policy.mjs';
import {readRuntimeJson} from './runtime-config.mjs';
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf'};
export function createApplication({db,config,auth=createAuth({db,config}),root=process.cwd()}){
 const api=createApi({db,auth}),publicRoot=resolve(root,'public'),files=new Map();
 async function asset(path,request){
  const file=resolve(publicRoot,'.'+path);if(!file.startsWith(publicRoot+sep)||path.split('/').some(p=>p.startsWith('.')))return new Response('Não encontrado.',{status:404});
  try{let cached=files.get(file);if(!cached){const body=await readFile(file),etag='"'+createHash('sha256').update(body).digest('hex')+'"';cached={body,etag};files.set(file,cached)}const headers={'content-type':mime[extname(file)]||'application/octet-stream',etag:cached.etag,'cache-control':'public, max-age=0, must-revalidate'};return new Response(request.headers.get('if-none-match')===cached.etag?null:cached.body,{status:request.headers.get('if-none-match')===cached.etag?304:200,headers})}catch{return new Response('Não encontrado.',{status:404})}
 }
 async function route(request){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
  const authentication=await auth.handle(request);if(authentication)return authentication;
  if(path.startsWith('/api/'))return api(request);
  if(!['GET','HEAD'].includes(request.method))return new Response('Método não permitido.',{status:405});
  if(path==='/'||path==='/ajuda'||path==='/acompanhamento'||path.startsWith('/acompanhamento/')){
   if(path.startsWith('/acompanhamento')){const person=await auth.user(request);if(!person)return new Response(null,{status:303,headers:{location:'/auth/login?returnTo='+encodeURIComponent(safeReturn(path+url.search)),'cache-control':'no-store'}})}
   const name=path==='/'?'panel':path==='/ajuda'?'help':'board';let html=await readFile(resolve(root,'views',name+'.html'),'utf8');
   if(name==='board'){const section=path.split('/')[2]||url.searchParams.get('section')||'bobinagem';if(!['bobinagem','montagem','montagem-ib'].includes(section))return new Response('Não encontrado.',{status:404});html=html.replace('const publicMontagem=false;','const publicMontagem=true;').replace("const publicSection='';",`const publicSection='${section}';`)}
   return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }
  return asset(path,request);
 }
 return async request=>{try{return await secureResponse(request,await route(request))}catch(error){console.error('Request failed',error.code||error.name);return Response.json({error:'Não foi possível processar a solicitação.'},{status:503,headers:{'cache-control':'no-store'}})}};
}
export function listen({handle,config}){
 const server=createServer(async(incoming,outgoing)=>{
  if(incoming.headers.host!==new URL(config.origin).host){outgoing.writeHead(400);outgoing.end('Host inválido.');return}
  try{
   const method=incoming.method||'GET',headers=new Headers();for(const [key,value]of Object.entries(incoming.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
   const body=['GET','HEAD'].includes(method)?undefined:Readable.toWeb(incoming);
   const request=new Request(new URL(incoming.url||'/',config.origin),{method,headers,body,duplex:'half'} as RequestInit);
   const response=await handle(request),responseHeaders=Object.fromEntries(response.headers.entries());delete responseHeaders['set-cookie'];
   outgoing.writeHead(response.status,{...responseHeaders,...(response.headers.getSetCookie().length?{'set-cookie':response.headers.getSetCookie()}: {})});
   if(method==='HEAD'||!response.body){outgoing.end();return}
   Readable.fromWeb(response.body as any).on('error',()=>outgoing.destroy()).pipe(outgoing);
  }catch{if(!outgoing.headersSent)outgoing.writeHead(500);outgoing.end('Erro interno.');}
 });server.requestTimeout=30000;server.headersTimeout=15000;return server.listen(config.port,config.host);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=configuration(),db=connectDatabase();
 const baseline=readRuntimeJson('BASELINE_GOALS_FILE',null);if(baseline){for(const turn of ['1','2','3'])if(!baseline[turn])throw Error('Invalid baseline goals');Object.assign(BASE_METAS,baseline)}
 const handle=createApplication({db,config}),server=listen({handle,config});
 console.log('Production panel server started.');
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(async()=>{await db.close();process.exit(0)}));
}
