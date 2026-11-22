import {createRemoteJWKSet,jwtVerify} from 'jose';
import * as oidc from 'openid-client';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export const IDLE_MS=15*60*1000;
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)};
export function safeReturn(value){return typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n]/.test(value)&&!value.startsWith('/auth/')?value:'/'}
export function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(s=>s.trim().split('=')).filter(x=>x.length===2))}
export function createAuth({db,config,discover=oidc.discovery,now=()=>Date.now(),onError=()=>{}}){
 let discovery,logoutKeys;
 const cookieName=config.secure?'__Host-weg_session':'weg_session',bindingName=config.secure?'__Host-weg_oidc':'weg_oidc';
 const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax${config.secure?'; Secure':''}; Max-Age=${maxAge}`;
 async function client(){
  if(!discovery)discovery=discover(new URL(config.issuer),config.clientId,config.clientSecret,oidc.ClientSecretBasic(config.clientSecret),{timeout:10,execute:[...(config.allowLoopback?[oidc.allowInsecureRequests]:[]),oidc.enableNonRepudiationChecks]}).catch(e=>{discovery=undefined;throw e});
  return discovery;
 }
 function redirect(to,headers={}){return new Response(null,{status:303,headers:{location:to,'Cache-Control':'no-store',...headers}})}
 async function user(req){const token=cookies(req)[cookieName];if(!/^[a-f0-9]{64}$/.test(token||''))return null;return db.prepare('SELECT u.*,s.expires AS session_expires,s.token AS session_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND s.absolute_expires>? AND u.active=1 AND u.oidc_issuer=?').bind(hash(token),now(),now(),config.issuer).first()}
 async function handle(req){const url=new URL(req.url);
  if(req.method==='GET'&&url.pathname==='/auth/login'){
   const c=await client(),state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier(),binding=randomBytes(32).toString('hex'),returnTo=safeReturn(url.searchParams.get('returnTo'));
   await db.batch([db.prepare('DELETE FROM oidc_requests WHERE expires<?').bind(now()),db.prepare('INSERT INTO oidc_requests(state_hash,binding_hash,verifier,nonce,return_to,expires) VALUES(?,?,?,?,?,?)').bind(hash(state),hash(binding),verifier,nonce,returnTo,now()+300000)]);
   const target=oidc.buildAuthorizationUrl(c,{redirect_uri:config.origin+'/auth/callback',response_type:'code',scope:'openid profile',state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
   return redirect(target.href,{'Set-Cookie':cookie(bindingName,binding,300)});
  }
  if(req.method==='GET'&&url.pathname==='/auth/callback'){
   const state=url.searchParams.get('state'),binding=cookies(req)[bindingName];
   if(!state||!binding)return Response.json({error:'Solicitação de acesso inválida.'},{status:400});
   // Consume once, bound to this browser. Invalid/missing binding never consumes
   // a different browser's login. State cannot be replayed after code exchange.
   const request=await db.prepare('DELETE FROM oidc_requests WHERE state_hash=? AND binding_hash=? AND expires>? RETURNING *').bind(hash(state),hash(binding),now()).first();
   if(!request||!equal(request.binding_hash,hash(binding)))return Response.json({error:'Solicitação expirada ou inválida.'},{status:400});
   try{
    const c=await client(),tokens=await oidc.authorizationCodeGrant(c,url,{pkceCodeVerifier:request.verifier,expectedState:state,expectedNonce:request.nonce,idTokenExpected:true}),claims=tokens.claims();
    if(!claims?.sub||claims.iss!==config.issuer)throw Error('Invalid identity');
    const token=randomBytes(32).toString('hex'),time=now();
    const allowed=await db.transaction(async tx=>{
     const person=await tx.prepare('SELECT * FROM users WHERE oidc_issuer=? AND oidc_subject=? AND active=1 FOR UPDATE').bind(config.issuer,claims.sub).first();
     if(!person)return false;
     const oldToken=cookies(req)[cookieName];if(oldToken)await tx.prepare('DELETE FROM sessions WHERE token=?').bind(hash(oldToken)).run();
     await tx.prepare('DELETE FROM sessions WHERE expires<? OR absolute_expires<?').bind(time,time).run();
     await tx.prepare('INSERT INTO sessions(token,user_id,expires,absolute_expires,oidc_sid) VALUES(?,?,?,?,?)').bind(hash(token),person.id,time+IDLE_MS,time+config.sessionMaxMs,typeof claims.sid==='string'?claims.sid:null).run();
     await tx.prepare('INSERT INTO audit(section,at,actor,action) VALUES(?,?,?,?)').bind(person.section,new Date(time).toISOString(),person.username,'login corporativo').run();return true;
    });
    if(!allowed)return redirect('/?auth_error=access_denied',{'Set-Cookie':cookie(bindingName,'',0)});
    const response=redirect(safeReturn(request.return_to));response.headers.append('Set-Cookie',cookie(bindingName,'',0));response.headers.append('Set-Cookie',cookie(cookieName,token,Math.ceil(config.sessionMaxMs/1000)));return response;
   }catch(error){onError(error);console.error('OIDC callback validation failed',error.code||error.name);return redirect('/?auth_error=login_failed',{'Set-Cookie':cookie(bindingName,'',0)})}
  }
  if(url.pathname==='/auth/backchannel-logout'&&req.method==='POST'){
   try{
    if((req.headers.get('content-type')||'').split(';')[0]!=='application/x-www-form-urlencoded')return new Response(null,{status:415});
    const reader=req.body?.getReader(),chunks=[];let size=0;if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();return new Response(null,{status:413})}chunks.push(part.value)}
    const token=new URLSearchParams(Buffer.concat(chunks).toString()).get('logout_token');if(!token)throw Error('Missing logout token');
    const c=await client();if(!logoutKeys){const uri=new URL(c.serverMetadata().jwks_uri);if(uri.protocol!=='https:'&&!(config.allowLoopback&&['127.0.0.1','localhost','[::1]'].includes(uri.hostname)))throw Error('Invalid JWKS URL');logoutKeys=createRemoteJWKSet(uri)}
    const {payload}=await jwtVerify(token,logoutKeys,{issuer:config.issuer,audience:config.clientId,algorithms:['RS256','PS256','ES256'],maxTokenAge:'5m',clockTolerance:5});
    if(typeof payload.jti!=='string'||!payload.jti||payload.jti.length>255||payload.nonce!==undefined||!payload.events||!Object.hasOwn(payload.events,'http://schemas.openid.net/event/backchannel-logout')||typeof payload.events['http://schemas.openid.net/event/backchannel-logout']!=='object'||payload.events['http://schemas.openid.net/event/backchannel-logout']===null||(!payload.sid&&!payload.sub))throw Error('Invalid logout claims');
    if(payload.sid!=null&&(typeof payload.sid!=='string'||!payload.sid)||payload.sub!=null&&(typeof payload.sub!=='string'||!payload.sub))throw Error('Invalid logout identity');
    await db.transaction(async tx=>{
     await tx.prepare('DELETE FROM oidc_logout_replays WHERE expires<?').bind(now()).run();
     const fresh=await tx.prepare('INSERT INTO oidc_logout_replays(jti_hash,expires) VALUES(?,?) ON CONFLICT DO NOTHING RETURNING jti_hash').bind(hash(payload.jti),now()+300000).first();if(!fresh)return;
     await tx.prepare('DELETE FROM sessions s USING users u WHERE s.user_id=u.id AND u.oidc_issuer=? AND (?::text IS NULL OR s.oidc_sid=?) AND (?::text IS NULL OR u.oidc_subject=?)').bind(config.issuer,payload.sid??null,payload.sid??null,payload.sub??null,payload.sub??null).run();
    });return new Response(null,{status:200,headers:{'Cache-Control':'no-store'}});
   }catch(error){onError(error);return new Response(null,{status:400,headers:{'Cache-Control':'no-store'}})}
  }
  if(url.pathname==='/api/logout'&&req.method==='POST'){
   if(req.headers.get('origin')!==config.origin||req.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'Origem inválida.'},{status:403});
   const token=cookies(req)[cookieName];if(token)await db.prepare('DELETE FROM sessions WHERE token=?').bind(hash(token)).run();
   return Response.json({ok:true},{headers:{'Set-Cookie':cookie(cookieName,'',0),'Cache-Control':'no-store'}});
  }
  return null;
 }
 return {user,handle,client,cookieName};
}
