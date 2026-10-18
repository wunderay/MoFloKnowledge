// OWASP Top 10:2025 checks that only the database can answer (A01, A02, A05, A06). Needs TEST_DATABASE_URL (see scripts/test-db.mjs).
// Not repeated here: role-by-role and worker-fencing cases in security.test.mjs, uploads-table.test.mjs, entry-delete.test.mjs and
// provenance-origin-hardening.test.mjs. These tests are generic sweeps over the catalog, so a new table or function is covered
// without editing them.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const supplied=process.env.TEST_DATABASE_URL;
if(!supplied)throw new Error('NOT_RUN: TEST_DATABASE_URL is required and must point to a disposable *_test database');
if(!new URL(supplied).pathname.endsWith('_test'))throw new Error('Test database name must end _test');
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
let administrator,admin;const sessions=[];
const owner=randomUUID(),viewer=randomUUID(),rival=randomUUID();
let A,B;
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));return q.rows[0];}
async function rejected(promise,pattern,message='must be rejected'){let error=null;try{await promise;}catch(e){error=e;}assert.ok(error,message);if(pattern)assert.match(error.message,pattern,message);return error;}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[owner,viewer,rival]);
 const asOwner=await connect('authenticated',owner),asRival=await connect('authenticated',rival);
 A=(await call(asOwner,'public.create_company',['Acme','https://acme.example',randomUUID()])).create_company;
 B=(await call(asRival,'public.create_company',['Rival','https://rival.example',randomUUID()])).create_company;
 await call(asOwner,'public.set_company_member',[A,viewer,'viewer']);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

test('A01 Broken Access Control: every table is row-level secured, closed to anonymous callers and invisible across companies',async t=>{
 const anon=await connect('anon'),stranger=await connect('authenticated',rival),reader=await connect('authenticated',viewer);
 const tables=(await admin.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY 1")).rows;
 assert.ok(tables.length>=8,'expected the application tables');
 await t.test('row-level security is on for every public table',()=>{assert.deepEqual(tables.filter(x=>!x.relrowsecurity).map(x=>x.relname),[]);});
 await t.test('anonymous callers can neither read tables nor run public functions',async()=>{
  for(const {relname} of tables)await rejected(anon.query(`SELECT * FROM public.${relname}`),/permission denied/,relname);
  const functions=(await admin.query("SELECT p.oid::regprocedure::text AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')")).rows; // extension helpers (pgcrypto) are pure functions
  assert.ok(functions.length>=10);
  for(const {name} of functions)assert.equal((await admin.query('SELECT has_function_privilege($1,$2::regprocedure,$3) ok',['anon',name,'EXECUTE'])).rows[0].ok,false,name);
 });
 await t.test('a member of another company sees no row of this one, in any table that has a company',async()=>{
  const scoped=(await admin.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='company_id' ORDER BY 1")).rows;
  assert.ok(scoped.length>=6);
  for(const {table_name} of scoped)assert.equal((await stranger.query(`SELECT 1 FROM public.${table_name} WHERE company_id=$1`,[A])).rowCount,0,table_name);
  assert.equal((await stranger.query('SELECT 1 FROM public.companies WHERE id=$1',[A])).rowCount,0);
 });
 await t.test('signed-in users cannot write tables directly; the only direct writes are upload metadata',async()=>{
  const writable=(await admin.query("SELECT c.relname,has_table_privilege('authenticated',c.oid,'INSERT') i,has_table_privilege('authenticated',c.oid,'UPDATE') u,has_table_privilege('authenticated',c.oid,'DELETE') d FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')")).rows;
  assert.deepEqual(writable.filter(x=>x.u).map(x=>x.relname),[],'no table-level UPDATE');
  assert.deepEqual(writable.filter(x=>x.i||x.d).map(x=>x.relname),['uploads']);
  await rejected(reader.query("INSERT INTO public.company_members(company_id,user_id,role,added_by) VALUES($1,$2,'owner',$2)",[A,viewer]),/permission denied/);
 });
 await t.test('RPCs on a company the caller does not belong to answer "unavailable"',async()=>{
  await rejected(call(stranger,'public.enqueue_scrape',[A,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]),/unavailable/);
  await rejected(call(stranger,'public.set_company_member',[A,rival,'owner']),/unavailable/);
  await rejected(call(stranger,'public.publish_knowledge_base',[A,0,randomUUID()]),/unavailable/);
 });
});

test('A02 Security Misconfiguration: SECURITY DEFINER functions pin search_path and internal functions are not callable by app users',async t=>{
 await t.test('every SECURITY DEFINER function sets an empty search_path',async()=>{
  const rows=(await admin.query("SELECT p.oid::regprocedure::text AS name,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prosecdef")).rows;
  assert.ok(rows.length>=20,'expected the application functions');
  assert.deepEqual(rows.filter(x=>!(x.proconfig??[]).some(setting=>/^search_path=("")?$/.test(setting))).map(x=>x.name),[]);
 });
 await t.test('anonymous callers cannot enter the private schema, and signed-in users cannot run the worker functions',async()=>{
  assert.equal((await admin.query("SELECT has_schema_privilege('anon','private','USAGE') ok")).rows[0].ok,false);
  const user=await connect('authenticated',owner);
  for(const name of ['claim_job(text)','heartbeat_job(uuid,uuid,uuid)','finish_job(uuid,uuid,uuid,jsonb,jsonb)','fail_job(uuid,uuid,uuid,jsonb)'])
   assert.equal((await admin.query('SELECT has_function_privilege($1,$2::regprocedure,$3) ok',['authenticated','private.'+name,'EXECUTE'])).rows[0].ok,false,name);
  await rejected(user.query("SELECT private.claim_job('intruder')"),/permission denied/);
 });
});

test('A05 Injection: SQL metacharacters in text are stored as text, and unsafe website schemes are refused by the database',async()=>{
 const user=await connect('authenticated',owner);
 const name="x'); DROP TABLE public.companies; --";
 const id=(await call(user,'public.create_company',[name,'https://inject.example',randomUUID()])).create_company;
 assert.equal((await user.query('SELECT name FROM public.companies WHERE id=$1',[id])).rows[0].name,name);
 assert.ok((await admin.query("SELECT to_regclass('public.companies') t")).rows[0].t);
 for(const website of ['javascript:alert(1)','file:///etc/passwd','ftp://example.com','http://user:pw@example.com'])
  await rejected(call(user,'public.create_company',['Hostile',website,randomUUID()]),/invalid|validation|url/i,website);
});

test('A06 Insecure Design: crawl requests are rate limited per company',async()=>{
 const user=await connect('authenticated',owner);
 for(let i=0;i<10;i++){
  const job=await call(user,'public.enqueue_scrape',[A,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
  await call(user,'public.cancel_scrape',[A,job.id]);
 }
 await rejected(call(user,'public.enqueue_scrape',[A,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]),/rate_limited/);
});
