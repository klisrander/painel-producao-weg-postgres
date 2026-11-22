import test from 'node:test';
import {request as rawRequest} from 'node:http';
import assert from 'node:assert/strict';
import {fixture,testUrl} from './support.mjs';
import {listen} from '../server/index.ts';
test('Node HTTP serves corporate UI/assets, rejects Host spoofing and preserves safe response headers',{skip:!testUrl},async t=>{
 const a=await fixture(t,{config:{origin:'http://127.0.0.1',secure:false,allowLoopback:true,port:0,host:'127.0.0.1'}}),server=listen({handle:a.handle,config:a.config});await new Promise(resolve=>server.once('listening',resolve));a.config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>new Promise(resolve=>server.close(resolve)));
 const login=await fetch(a.config.origin);assert.equal(login.status,200);assert.match(await login.text(),/Entrar com conta WEG/);assert.match(login.headers.get('content-security-policy'),/frame-ancestors 'self'/);assert.equal(login.headers.get('cache-control'),'no-store');
 const asset=await fetch(a.config.origin+'/policy.js');assert.equal(asset.status,200);assert.equal((await fetch(a.config.origin+'/policy.js',{headers:{'if-none-match':asset.headers.get('etag')}})).status,304);
 assert.equal((await fetch(a.config.origin+'/api/bootstrap')).status,401);assert.equal(await new Promise(resolve=>{const req=rawRequest(a.config.origin,{headers:{host:'wrong.example'}},response=>{response.resume();resolve(response.statusCode)});req.end()}),400);assert.equal((await fetch(a.config.origin+'/.env')).status,404);
 const data='{"value":"'+'x'.repeat(40000)+'"}';const response=await fetch(a.config.origin+'/api/record',{method:'POST',headers:{origin:a.config.origin,'content-type':'application/json'},body:data});assert.equal(response.status,413);
});
