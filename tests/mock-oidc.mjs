import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
export async function mockProvider(){
 const {publicKey,privateKey}=await generateKeyPair('RS256'),wrong=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'synthetic-rsa',alg:'RS256',use:'sig'},codes=new Map();let issuer,exchanges=0;
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,issuer||'http://127.0.0.1');
  res.setHeader('content-type','application/json');
  if(url.pathname.endsWith('/.well-known/openid-configuration')){res.end(JSON.stringify({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_basic'],code_challenge_methods_supported:['S256']}));return}
  if(url.pathname.endsWith('/jwks')){res.end(JSON.stringify({keys:[jwk]}));return}
  if(url.pathname.endsWith('/token')){
   let body='';for await(const chunk of req)body+=chunk;const form=new URLSearchParams(body),entry=codes.get(form.get('code'));exchanges++;
   const basic=Buffer.from((req.headers.authorization||'').slice(6),'base64').toString().split(':').map(decodeURIComponent).join(':');
   if(!entry||basic!=='synthetic-client:synthetic-test-only'||createHash('sha256').update(form.get('code_verifier')||'').digest('base64url')!==entry.challenge){res.statusCode=400;res.end(JSON.stringify({error:'invalid_grant'}));return}
   codes.delete(form.get('code'));
   const overrides=entry.overrides,claims={sid:'synthetic-sid',nonce:entry.nonce,...overrides};
   const jwt=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(overrides.iss||issuer).setSubject(overrides.sub||'synthetic-subject').setAudience(overrides.aud||'synthetic-client').setIssuedAt().setExpirationTime(overrides.exp||'5m').sign(overrides.__wrongSignature?wrong.privateKey:privateKey);
   res.end(JSON.stringify({access_token:'synthetic-access-token',token_type:'Bearer',expires_in:300,id_token:jwt}));return;
  }
  res.statusCode=404;res.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));issuer='http://127.0.0.1:'+server.address().port+'/realms/synthetic';
 return {issuer,async logoutToken(overrides={}){return new SignJWT({events:{'http://schemas.openid.net/event/backchannel-logout':{}},jti:randomBytes(16).toString('hex'),sid:'synthetic-sid',...overrides}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(issuer).setAudience('synthetic-client').setIssuedAt().setExpirationTime('5m').sign(privateKey)},get exchanges(){return exchanges},issue(authorization,overrides={}){const q=new URL(authorization).searchParams,code=randomBytes(16).toString('hex');codes.set(code,{nonce:q.get('nonce'),challenge:q.get('code_challenge'),overrides});return q.get('redirect_uri')+'?'+new URLSearchParams({code,state:q.get('state')})},close:()=>new Promise(resolve=>server.close(resolve))};
}
