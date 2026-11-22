import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,testUrl} from './support.mjs';
import {importBackup} from '../scripts/import-backup.mjs';
import {provision} from '../scripts/provision-user.mjs';
const enabled={skip:!testUrl};
function backup(){return {users:[{id:10,username:'synthetic_migrated',salt:'synthetic-old-salt',hash:'synthetic-old-hash',email:'synthetic@example.test',name:'Pessoa sintética',job:'Gestor',role:'admin',start:'05:00',end:'14:17',active:1,section:'bobinagem',general_admin:1,turno:'1',permissions:null},{id:20,username:'synthetic_historical',name:'Histórico sintético',job:'Preparador',role:'operador',start:'05:00',end:'14:17',active:1,section:'bobinagem',general_admin:0,turno:'1',permissions:null}],records:[{id:30,section:'bobinagem',kind:'producao',owner:20,created:'2026-01-01T05:00:00',updated:'2026-01-01T05:00:00',data:JSON.stringify({data:'2026-01-01',linha:'Linha 01',etapa:'Bobinagem',turno:'1',producao:12,defeitos:0,meta:null})}],audit:[{id:40,section:'bobinagem',at:'2026-01-01T05:00:00',actor:'synthetic_historical',action:'teste',record_id:30,before_data:null,after_data:JSON.stringify({hash:'synthetic-old-hash',email:'synthetic@example.test',producao:12})}],goal_changes:[],performance_changes:[],projection_plans:[],projection_revisions:[]}}
test('private migration dry-run, stable IDs, inactive unlinked users, credential stripping and sequence reset',enabled,async t=>{
 const a=await fixture(t),input=backup(),options={issuer:a.config.issuer,identities:[{legacy_id:10,subject:'synthetic-mapped-sub'}]};
 const preview=await importBackup(a.db,[input],options);assert.equal(preview.dryRun,true);assert.equal((await a.db.query('SELECT COUNT(*) n FROM users')).rows[0].n,0);
 const imported=await importBackup(a.db,[input],{...options,apply:true});assert.equal(imported.counts.records,1);const users=(await a.db.query('SELECT * FROM users ORDER BY id')).rows;assert.equal(users[0].id,10);assert.equal(users[0].oidc_subject,'synthetic-mapped-sub');assert.equal(users[1].active,0);assert.ok(!('hash' in users[0])&&!('email' in users[0]));
 assert.equal((await a.db.query('SELECT owner FROM records')).rows[0].owner,20);assert.deepEqual(JSON.parse((await a.db.query('SELECT after_data FROM audit')).rows[0].after_data),{producao:12});
 const next=await provision(a.db,{username:'synthetic_next',issuer:a.config.issuer,subject:'synthetic-next-sub'});assert.ok(next.id>20);
 await provision(a.db,{username:'synthetic_historical',legacyId:20,issuer:a.config.issuer,subject:'synthetic-linked-later'});assert.equal((await a.db.prepare('SELECT active FROM users WHERE id=?').bind(20).first()).active,1);
 await assert.rejects(importBackup(a.db,[input],{...options,apply:true}),/empty destination/);
});
test('invalid references and conflicting snapshots abort without partial imported rows',enabled,async t=>{
 const a=await fixture(t),input=backup();input.records[0].owner=999;await assert.rejects(importBackup(a.db,[input],{issuer:a.config.issuer,apply:true}),/owner absent/);assert.equal((await a.db.query('SELECT COUNT(*) n FROM users')).rows[0].n,0);
 const b=backup(),conflict=backup();conflict.records[0].data='{}';await assert.rejects(importBackup(a.db,[b,conflict],{issuer:a.config.issuer}),/Conflicting/);
});
