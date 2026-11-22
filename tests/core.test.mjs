import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {parameters} from '../db/postgres.mjs';
import {configuration} from '../server/config.mjs';
import {safeReturn} from '../server/auth.mjs';
import * as Policy from '../lib/production-policy.mjs';
import {project,normalizePlan} from '../lib/projection/math.mjs';
import {sectionConfig} from '../lib/section-config.mjs';
const valid={APP_ORIGIN:'https://panel.example.test',DATABASE_URL:'postgresql://synthetic@localhost/panel',OIDC_ISSUER:'https://identity.example.test/realms/test',OIDC_CLIENT_ID:'synthetic-client',OIDC_CLIENT_SECRET:'synthetic-placeholder-test',NODE_ENV:'production'};
test('configuration fails closed without corporate configuration and requires HTTPS',()=>{
 assert.equal(configuration(valid).origin,valid.APP_ORIGIN);assert.throws(()=>configuration({...valid,OIDC_ISSUER:''}));assert.throws(()=>configuration({...valid,APP_ORIGIN:'http://localhost:3000',ALLOW_HTTP_LOOPBACK:'true'}));assert.throws(()=>configuration({...valid,APP_ORIGIN:'https://panel.example.test/path'}));assert.throws(()=>configuration({...valid,OIDC_ISSUER:'https://user:secret@identity.example.test'}));
 assert.equal(configuration({...valid,NODE_ENV:'development',APP_ORIGIN:'http://localhost:3000',OIDC_ISSUER:'http://localhost:8080/realms/test',ALLOW_HTTP_LOOPBACK:'true'}).secure,false);
});
test('redirect targets are local, query parameters are bound and SQL literals are untouched',()=>{
 for(const x of ['https://evil.example','//evil.example','/\\evil','/auth/callback','/\r\nevil'])assert.equal(safeReturn(x),'/');assert.equal(safeReturn('/acompanhamento/bobinagem?from=2026-01-01'),'/acompanhamento/bobinagem?from=2026-01-01');
 assert.deepEqual(parameters("SELECT '?' AS literal, 'it''s ?' AS label WHERE id=? AND name=?"),{sql:"SELECT '?' AS literal, 'it''s ?' AS label WHERE id=$1 AND name=$2",count:2});
});
test('corporate login has no local password/email forms and browser scripts compile',()=>{
 for(const name of ['panel','help','board']){const html=readFileSync(new URL('../views/'+name+'.html',import.meta.url),'utf8'),{document}=parseHTML(html);for(const script of document.querySelectorAll('script:not([src])'))new vm.Script(script.textContent);assert.ok(!html.includes('producao.usezavero.com.br'));
  if(name==='panel'){assert.equal(document.querySelectorAll('input[type=password],input[type=email]').length,0);assert.equal(document.querySelector('#recovery'),null);assert.match(document.querySelector('#loginSubmit').textContent,/conta WEG/);assert.ok(document.querySelector('#userForm [name=oidc_subject]'));assert.ok(!html.includes('/api/password'))}
 }
 new vm.Script(readFileSync(new URL('../public/users-permissions.js',import.meta.url),'utf8'));
});
test('existing shift rules, CAP percentages and partial-day planning survive the port',()=>{
 assert.equal(Policy.operationDate('3','2026-11-19T01:00'),'2026-11-18');const history=[{id:1,effective_date:'2026-01-01',line:'Linha 01',stage:'Bobinagem',turno:'1',capacity:100,efficiency_target:91}];assert.equal(Policy.performanceFor('2026-11-01','Bobinagem','Linha 01','1',history).target,91);
 const p=normalizePlan({name:'Teste',stage:'Bobinagem',start_date:'2026-01-01',initial_backlog:10,data:{rows:[{date:'2026-01-01',demand:100,forecast:130}]}},sectionConfig('bobinagem'));const input={...p,id:'test'},live={'2026-01-01':{production:40,defects:0,count:1,shifts:'1'}};const open=project(input,live,'2026-01-01');assert.equal(open.rows[0].partial_today,true);assert.equal(open.rows[0].past,false);
});
