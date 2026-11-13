import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { pool, db, validate } from './fixture-db.mjs';
const checks = {};
const base = process.env.AGENTBRIDGE_BASE_URL;
const root = process.env.FIXTURE_REPO;
const fetchImpl = globalThis.fetch;
// The disposable native proxy owns the fixture service allowlist.
const { suggestPhotoTitle } = await import(new URL(`${root}/lib/projects/naming.ts`, 'file:').href);
const { callProviderJson } = await import(new URL(`${root}/lib/generation/provider-calls.ts`, 'file:').href);
const context = { ownerId: '00000000-0000-4000-8000-000000000001', projectId: '00000000-0000-4000-8000-000000000002' };
const attempt = '00000000-0000-4000-8000-000000000003';
try {
  validate(); checks.no_database_secret = !process.env.DATABASE_URL && process.env.RESHOOT_DATABASE_CONNECTION === 'reshoot_database_public_placeholder';
  checks.sandbox_private_files = await readFile(process.env.FIXTURE_CANARY).then(()=>false,()=>true);
  checks.sandbox_keychain = Boolean(spawnSync('/usr/bin/security',['help']).error);
  checks.sandbox_direct_database = await new Promise(resolve=>{const s=net.connect(Number(process.env.FIXTURE_PG_PORT),'127.0.0.1');s.once('error',()=>resolve(true));s.once('connect',()=>{s.destroy();resolve(false)});s.setTimeout(1500,()=>{s.destroy();resolve(true)});});
  const result = await pool.query({ text:"select $1::int as number, $2::jsonb as data, $3::boolean as flag, $4::timestamptz as time, $5::bytea as bytes, $6::text[] as array, '$1 is literal' as literal", values:[7,{a:1},true,new Date('2026-11-05T00:00:00Z'),Buffer.from([1,2,3]),['one','two']] });
  assert.deepEqual(result.rows[0],{number:7,data:{a:1},flag:true,time:new Date('2026-11-05T00:00:00Z'),bytes:Buffer.from([1,2,3]),array:['one','two'],literal:'$1 is literal'});checks.types_and_parameters=true;
  await db.transaction(async tx=>{
    await tx.execute(sql`insert into relay_probe(id,value) values('committed',1)`);
    const rows=await tx.execute(sql`select value from relay_probe where id='committed'`);assert.equal(rows.rows[0].value,1);
    await tx.transaction(async nested=>{await nested.execute(sql`update relay_probe set value=2 where id='committed'`)});
    try{await tx.transaction(async nested=>{await nested.execute(sql`update relay_probe set value=3 where id='committed'`);throw new Error('Synthetic rollback')})}catch{}
  });
  assert.equal((await pool.query("select value from relay_probe where id='committed'")).rows[0].value,2);checks.commit_and_nested_savepoints=true;
  await assert.rejects(db.transaction(async tx=>{await tx.execute(sql`insert into relay_probe(id,value) values('rolled-back',1)`);throw new Error('Synthetic rollback')}));
  assert.equal((await pool.query("select count(*)::int as n from relay_probe where id='rolled-back'")).rows[0].n,0);checks.rollback=true;
  const a=await pool.connect();const b=await pool.connect();await a.query('begin');await b.query('begin');await a.query("select * from relay_probe where id='committed' for update");
  await assert.rejects(b.query("select * from relay_probe where id='committed' for update nowait"),e=>e.code==='55P03');await b.query('rollback');await a.query('rollback');a.release();b.release();checks.row_lock_and_sqlstate=true;
  // Actual naming and image call functions, with a real disposable cost ledger.
  assert.equal(await suggestPhotoTitle(Buffer.from('synthetic preview'),context),'Synthetic ceramic mug');
  const image=await callProviderJson({...context,purpose:'image',generationAttemptId:attempt,endpoint:base+'/images',apiKey:process.env.AGENTBRIDGE_API_KEY,timeoutMs:1000,body:{model:'openrouter/openai/gpt-image-2.5-flare',prompt:'Synthetic local fixture only'}});
  assert.equal(image.ok,true);assert.equal(image.usageCostMicros,0);checks.actual_clients_with_durable_ledger=true;
  const rows=await pool.query('select state,usage_cost_micros from provider_calls order by purpose');assert.equal(rows.rowCount,2);assert.ok(rows.rows.every(r=>r.state==='completed'&&r.usage_cost_micros==='0'));checks.cost_records_persisted=true;
  await pool.query('revoke insert on provider_calls from reshoot_vault_fixture');
  assert.equal(await suggestPhotoTitle(Buffer.from('synthetic preview'),context),null);
  await assert.rejects(callProviderJson({...context,purpose:'image',generationAttemptId:'00000000-0000-4000-8000-000000000004',endpoint:base+'/images',apiKey:process.env.AGENTBRIDGE_API_KEY,timeoutMs:1000,body:{model:'openrouter/openai/gpt-image-2.5-flare'}}));
  await pool.query('grant insert on provider_calls to reshoot_vault_fixture');checks.unavailable_ledger_stops_inference=true;
  const client=await pool.connect();await client.query('begin');await client.query("insert into relay_probe values('ambiguous-commit',1)");await assert.rejects(client.query('commit /*lose-reply*/'));
  await assert.rejects(client.query("insert into relay_probe values('must-not-send',1)"));client.release();checks.ambiguous_commit_never_retried=true;
  // Fresh clients still work; a broken client does not poison other sessions.
  const orphan=await pool.connect();await orphan.query('begin');await orphan.query("insert into relay_probe values('orphan-rollback',1)");
  await new Promise(resolve=>setTimeout(resolve,3700));
  await assert.rejects(orphan.query('select 1'));orphan.release();
  assert.equal((await pool.query("select count(*)::int as n from relay_probe where id='orphan-rollback'")).rows[0].n,0);checks.expiry_rolls_back_orphans=true;
  // Protocol-level isolation and replay checks through the same scoped Vault proxy.
  const owner=randomBytes(24).toString('hex');const other=randomBytes(24).toString('hex');
  async function raw(path,body,id=owner,credential='reshoot_database_public_placeholder'){
    const r=await fetchImpl(new URL(path,process.env.FIXTURE_RELAY),{method:'POST',headers:{'Content-Type':'application/json','X-Reshoot-Owner':id,'Reshoot-Database-Connection':credential},body:JSON.stringify(body),redirect:'error'});
    return {status:r.status,body:await r.json()};
  }
  const opened=await raw('/v1/db/open',{});assert.equal(opened.status,200);const connection=opened.body.connection;
  assert.equal((await raw('/v1/db/query',{connection,sequence:0,sql:'select 1',parameters:[]},other)).status,403);
  assert.equal((await raw('/v1/db/query',{connection,sequence:0,sql:'select 1',parameters:[]})).status,200);
  assert.equal((await raw('/v1/db/query',{connection,sequence:0,sql:"insert into relay_probe values('replayed',1)",parameters:[]})).status,403);
  assert.equal((await raw('/v1/db/close',{connection,sequence:1})).status,200);checks.session_isolation_and_replay_rejection=true;
  const errorClient=await pool.connect();try{await errorClient.query("DO $$ BEGIN RAISE EXCEPTION 'private diagnostic'; END $$");throw new Error('Expected SQL failure')}catch(e){assert.equal(e.code,'P0001');assert.ok(!e.message.includes('private diagnostic'))}finally{errorClient.release()};checks.server_errors_sanitized=true;
  const forbidden = await pool.query("select rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls from pg_roles where rolname=current_user");assert.ok(Object.values(forbidden.rows[0]).every(v=>v===false));checks.fixture_role_unprivileged=true;
  await pool.end();console.log(JSON.stringify({ok:true,checks}));
}catch(e){await pool.end();console.log(JSON.stringify({ok:false,checks,stage:e.code??e.name,reason:e.message.startsWith('Database')?e.message:'Fixture assertion failed'}));process.exitCode=1;}
