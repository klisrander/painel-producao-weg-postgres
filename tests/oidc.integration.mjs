import test from 'node:test';
import assert from 'node:assert/strict';
import {mockProvider} from './mock-oidc.mjs';
import {fixture,testUrl} from './support.mjs';
const enabled={skip:!testUrl};
async function flow(t){const provider=await mockProvider();t.after(()=>provider.close());const a=await fixture(t,{config:{issuer:provider.issuer,allowLoopback:true}});return {...a,provider}}
const binding=r=>r.headers.getSetCookie().find(x=>x.includes('weg_oidc=')).split(';')[0];
async function start(a){return a.auth.handle(new Request(a.config.origin+'/auth/login?returnTo=%2Facompanhamento%2Fbobinagem'))}
test('real OIDC authorization-code/PKCE, validated JWT, opaque server session and one-use state',enabled,async t=>{
 const a=await flow(t);await a.person({subject:'synthetic-subject'});const login=await start(a);assert.equal(login.status,303);const authorization=new URL(login.headers.get('location'));assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');assert.equal(authorization.searchParams.get('scope'),'openid profile');assert.ok(authorization.searchParams.get('nonce'));
 const callback=a.provider.issue(authorization),response=await a.auth.handle(new Request(callback,{headers:{cookie:binding(login)}}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/acompanhamento/bobinagem');const cookie=response.headers.getSetCookie().find(x=>x.includes('weg_session=')).split(';')[0];assert.match(cookie,/^__Host-weg_session=[a-f0-9]{64}$/);assert.ok(!cookie.includes('synthetic-access-token'));
 const user=await a.auth.user(new Request(a.config.origin+'/api/bootstrap',{headers:{cookie}}));assert.equal(user.username,'synthetic_admin');assert.equal((await a.auth.handle(new Request(callback,{headers:{cookie:binding(login)}}))).status,400);assert.equal(a.provider.exchanges,1);
});
test('browser binding, state, nonce, issuer, audience and expiration fail closed',enabled,async t=>{
 const a=await flow(t);await a.person({subject:'synthetic-subject'});
 const first=await start(a),url=a.provider.issue(first.headers.get('location'));
 assert.equal((await a.auth.handle(new Request(url))).status,400);assert.equal((await a.auth.handle(new Request(url,{headers:{cookie:'__Host-weg_oidc=wrong-browser'}}))).status,400);assert.equal(a.provider.exchanges,0);
 const valid=await a.auth.handle(new Request(url,{headers:{cookie:binding(first)}}));assert.ok(valid.headers.getSetCookie().some(x=>x.includes('weg_session=')));
 for(const override of [{nonce:'wrong'},{iss:'https://wrong.example/realm'},{aud:'another-client'},{exp:1},{__wrongSignature:true}]){
  const login=await start(a),bad=a.provider.issue(login.headers.get('location'),override),response=await a.auth.handle(new Request(bad,{headers:{cookie:binding(login)}}));assert.equal(response.headers.get('location'),'/?auth_error=login_failed');assert.ok(!response.headers.getSetCookie().some(x=>x.includes('weg_session=')));
 }
});
test('unprovisioned or inactive identities never inherit access by username/email/Windows headers',enabled,async t=>{
 const a=await flow(t);await a.person({subject:'different-subject'});const login=await start(a),callback=a.provider.issue(login.headers.get('location'),{preferred_username:'synthetic_admin',email:'synthetic@example.test'}),result=await a.auth.handle(new Request(callback,{headers:{cookie:binding(login),'X-Remote-User':'synthetic_admin'}}));assert.equal(result.headers.get('location'),'/?auth_error=access_denied');
 await a.db.prepare('UPDATE users SET active=0,oidc_subject=?').bind('synthetic-subject').run();const second=await start(a),rejected=await a.auth.handle(new Request(a.provider.issue(second.headers.get('location')),{headers:{cookie:binding(second)}}));assert.equal(rejected.headers.get('location'),'/?auth_error=access_denied');
});

test('Keycloak backchannel logout validates signatures/claims and invalidates matching SSO sessions',enabled,async t=>{
 const a=await flow(t);await a.person({subject:'synthetic-subject'});const login=await start(a),response=await a.auth.handle(new Request(a.provider.issue(login.headers.get('location')),{headers:{cookie:binding(login)}})),cookie=response.headers.getSetCookie().find(x=>x.includes('weg_session=')).split(';')[0];assert.ok(await a.auth.user(new Request(a.config.origin,{headers:{cookie}})));
 const send=token=>a.auth.handle(new Request(a.config.origin+'/auth/backchannel-logout',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({logout_token:token})}));
 assert.equal((await send(await a.provider.logoutToken({nonce:'invalid'}))).status,400);assert.ok(await a.auth.user(new Request(a.config.origin,{headers:{cookie}})));
 const token=await a.provider.logoutToken();assert.equal((await send(token)).status,200);assert.equal(await a.auth.user(new Request(a.config.origin,{headers:{cookie}})),null);assert.equal((await send(token)).status,200);
});
