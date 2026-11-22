import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,testUrl} from './support.mjs';
import {migrate} from '../scripts/migrate.mjs';
const enabled={skip:!testUrl};
const production={kind:'producao',data:{data:'2026-11-20',linha:'Linha 01',etapa:'Bobinagem',turno:'1',producao:120,defeitos:2}};
const draft={name:'Cenário sintético',stage:'Bobinagem',start_date:'2026-11-20',initial_backlog:20,data:{rows:[{date:'2026-11-20',demand:100,forecast:120},{date:'2026-11-21',demand:100,forecast:120}],actions:[]}};
test('PostgreSQL migrations, atomic rollback, and no password/mail tables',enabled,async t=>{
 const a=await fixture(t);await migrate(a.db);const columns=(await a.db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users'")).rows.map(x=>x.column_name);assert.ok(!columns.includes('email')&&!columns.includes('hash')&&!columns.includes('salt'));assert.ok(columns.includes('oidc_subject'));
 await assert.rejects(a.db.batch([a.db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('same','first'),a.db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('same','second')]));assert.equal((await a.db.query('SELECT COUNT(*) n FROM settings')).rows[0].n,0);
});
test('session required, section isolation, CSRF, create/edit/export and exact record audit id',enabled,async t=>{
 const a=await fixture(t),admin=await a.person(),operator=await a.person({username:'synthetic_operator',role:'operador',job:'Preparador',general_admin:0});
 assert.equal((await a.request('/api/bootstrap')).status,401);assert.equal((await a.request('/api/public/bobinagem/production')).status,401);assert.equal((await a.request('/api/bootstrap',{headers:{'X-Remote-User':'admin','X-Windows-User':'admin'}})).status,401);
 assert.equal((await a.request('/api/record',{as:admin,data:production,headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await a.request('/api/record',{as:admin,data:production})).status,200);
 const records=(await a.request('/api/records',{as:admin})).body;assert.equal(records.length,1);assert.equal(records[0].data.producao,120);const audit=(await a.db.query("SELECT * FROM audit WHERE action='criou producao'")).rows;assert.equal(audit[0].record_id,records[0].id);
 assert.equal((await a.request('/api/bootstrap',{as:operator,headers:{'X-WEG-Section':'montagem'}})).status,403);assert.equal((await a.request('/api/public/montagem/production',{as:operator})).status,403);
 const publicData=await a.request('/api/public/bobinagem/production',{as:operator});assert.equal(publicData.status,200);assert.equal(publicData.body.rows[0].producao,120);
 const stop={kind:'perturbacao',data:{data:'2026-11-20',linha:'Linha 01',turno:'1',equipamentoId:'L1-R16',motivo:'MANUTENÇÃO',comentario:'Teste sintético',inicio:'05:00',fim:'05:30'}};assert.equal((await a.request('/api/record',{as:admin,data:stop})).status,200);
 const exportFile=await a.request('/api/records/export?type=producao&from=2026-11-20&to=2026-11-20',{as:admin});assert.equal(exportFile.status,200);assert.equal(exportFile.body[0],80);
 assert.equal((await a.request('/api/login',{as:admin,data:{username:'admin',password:'ignored'}})).status,404);assert.equal((await a.request('/api/password-recovery/request',{as:admin,data:{email:'ignored@example.test'}})).status,404);
});
test('PostgreSQL CAP optimistic revisions, planning JSON aggregation, archive/history and Excel',enabled,async t=>{
 const a=await fixture(t),admin=await a.person();
 const payload={effective_date:'2099-01-01',turno:'1',entries:[{line:'Linha 01',stage:'Bobinagem',capacity:100,efficiency_target:91,expected_revision:0}]};
 assert.equal((await a.request('/api/performance',{as:admin,data:payload})).status,200);assert.equal((await a.request('/api/performance',{as:admin,data:payload})).status,409);
 await a.request('/api/record',{as:admin,data:production});
 const saved=await a.request('/api/projection/save',{as:admin,data:draft});assert.equal(saved.status,200,JSON.stringify(saved.body));const p=saved.body.plan;
 const detail=await a.request('/api/projection/plan?id='+p.id,{as:admin});assert.equal(detail.status,200,JSON.stringify(detail.body));assert.equal(detail.body.panel['2026-11-20'].production,120);
 const updated=await a.request('/api/projection/save',{as:admin,data:{...p,name:'Revisão sintética'}});assert.equal(updated.body.plan.revision,2);assert.equal((await a.request('/api/projection/save',{as:admin,data:p})).status,409);
 assert.equal((await a.request('/api/projection/history?id='+p.id,{as:admin})).body.history.length,2);
 const excel=await a.request('/api/projection/export-xlsx',{as:admin,data:{...updated.body.plan,draft:true}});assert.equal(excel.status,200,JSON.stringify(excel.body));assert.equal(excel.body[0],80);
 assert.equal((await a.request('/api/projection/archive',{as:admin,data:{id:p.id,revision:2,archived:true}})).status,200);assert.equal((await a.request('/api/projection/plans',{as:admin})).body.plans.length,0);assert.equal((await a.request('/api/projection/plans?archived=1',{as:admin})).body.plans.length,1);
});
test('corporate provisioning has no password, stable sub mapping and no self-demotion',enabled,async t=>{
 const a=await fixture(t),admin=await a.person(),data={name:'Pessoa sintética',username:'synthetic_new',oidc_subject:'synthetic-sub',job:'Preparador',role:'operador',turno:'1',section:'bobinagem',general_admin:false,active:true};
 assert.equal((await a.request('/api/users',{as:admin,data})).status,200);assert.equal((await a.request('/api/users',{as:admin,data:{...data,password:'reject'}})).status,400);
 const saved=await a.db.prepare('SELECT * FROM users WHERE username=?').bind(data.username).first();assert.equal(saved.oidc_issuer,a.config.issuer);assert.equal(saved.oidc_subject,data.oidc_subject);
 assert.equal((await a.request('/api/user-update',{as:admin,data:{...data,id:saved.id,oidc_subject:'different'}})).status,400);
 assert.equal((await a.request('/api/user-update',{as:admin,data:{...data,id:admin.id,name:'Synthetic admin',role:'operador',general_admin:false}})).status,400);
});
test('server-enforced inactivity, activity renewal cap and local logout',enabled,async t=>{
 const a=await fixture(t),admin=await a.person();await a.db.prepare('UPDATE sessions SET expires=? WHERE token=?').bind(Date.now()-1,admin.hash).run();assert.equal((await a.request('/api/bootstrap',{as:admin})).status,401);assert.equal((await a.request('/api/session/activity',{as:admin,data:{at:Date.now()}})).status,401);
 const fresh=await a.person({username:'fresh'});await a.db.prepare('UPDATE sessions SET absolute_expires=? WHERE token=?').bind(Date.now()+2000,fresh.hash).run();assert.equal((await a.request('/api/session/activity',{as:fresh,data:{at:Date.now()}})).status,200);const row=await a.db.prepare('SELECT * FROM sessions WHERE token=?').bind(fresh.hash).first();assert.ok(row.expires<=row.absolute_expires);
 assert.equal((await a.request('/api/logout',{as:fresh,data:{}})).status,200);assert.equal((await a.request('/api/bootstrap',{as:fresh})).status,401);
});
test('concurrent CAP edits yield one commit and one conflict with no partial audit',{skip:!testUrl},async t=>{
 const a=await fixture(t),admin=await a.person(),payload=capacity=>({effective_date:'2099-02-01',turno:'2',entries:[{line:'Linha 01',stage:'Bobinagem',capacity,efficiency_target:91,expected_revision:0}]});
 const results=await Promise.all([a.request('/api/performance',{as:admin,data:payload(100)}),a.request('/api/performance',{as:admin,data:payload(200)})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal((await a.db.query('SELECT COUNT(*) n FROM performance_changes')).rows[0].n,1);assert.equal((await a.db.query('SELECT COUNT(*) n FROM audit')).rows[0].n,1);
});
