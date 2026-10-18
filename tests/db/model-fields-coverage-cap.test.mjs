// Coverage cap, database half. The TypeScript half is
// tests/contracts/model-fields-coverage-cap.test.ts, which also states the derivation:
//   rows = 32 singleton fields + 8 per key person + 8 per offering + 1 for an empty collection;
//   a published snapshot carries at most 500 claims and every populated person/offering needs its own claim, so a
//   legitimate snapshot has at most 500 people + offerings: maximum = 32 + 8 x 500 + 1 = 4,033 coverage rows.
// Publication must accept that maximum and the SQL export contract must refuse one row more.
//
// Setup note: the entries are bulk-loaded as the database owner with triggers off (session_replication_role = replica) because
// creating 500 entries through the protected functions takes minutes; a sample of the loaded revisions is then checked with the
// protected validator (private.assert_revision), and publication itself, which is what the cap governs, runs through the
// protected function with every trigger on.
// Needs a disposable PostgreSQL (see scripts/test-db.mjs); without TEST_DATABASE_URL it reports NOT_RUN.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';
import {resolve} from 'node:path';
const supplied=process.env.TEST_DATABASE_URL;
if(!supplied)throw new Error('NOT_RUN: TEST_DATABASE_URL is required and must point to a disposable *_test database');
if(!new URL(supplied).pathname.endsWith('_test'))throw new Error('Test database name must end _test');
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
const root=process.env.CONTRACTS_ROOT??'.';
let administrator,admin;const sessions=[];
const owner=randomUUID();
const MAX_ROWS=4033;
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));return q.rows[0];}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 assert.ok((await readdir(new URL('../../supabase/migrations/',import.meta.url))).length>0);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
});
after(async()=>{for(const c of sessions)await c.end().catch(()=>{});if(administrator){await administrator.query(`DROP DATABASE IF EXISTS "${database}"`);await administrator.end();}});

const FIELDS={key_person:['name','title','role','gender','background_or_relevance','age','nationality','portrait'],offering:['name','description','offering_type','category','features','pricing','url','images']};
function entryOf(kind,n){
 const id=randomUUID(),section=kind==='key_person'?'key_people':'offerings';
 const content=kind==='key_person'
  ?{id,name:`Person ${n}`,title:null,role:null,gender:null,background_or_relevance:null,age:null,nationality:null,portrait:null}
  :{id,name:`Offering ${n}`,description:null,offering_type:null,category:null,features:[],pricing:null,url:null,images:[]};
 const provenance={sources:[],evidence:[],claims:[{id:randomUUID(),entry_id:id,targets:[`/${section}/@${id}/name`],origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:owner,authored_at:'2026-10-17T00:00:00.000Z',note:'Entered by hand'}],
  coverage:FIELDS[kind].map(field=>({targets:[`/${section}/@${id}/${field}`],status:'not_checked',job_id:null,reason:'Entered manually'})),operations:[],conflicts:[],decisions:[]};
 return {id,kind,content,provenance};
}
/** Bulk-loads approved entries for `company` (see the setup note above) and bumps the draft generation once. */
async function load(company,entries){
 await admin.query('BEGIN');
 try{
  await admin.query("SET LOCAL session_replication_role = replica");
  const rows=entries.map((entry,index)=>({id:entry.id,kind:entry.kind,n:index,content:entry.content,provenance:entry.provenance}));
  await admin.query("INSERT INTO public.knowledge_entries(id,company_id,kind,created_by,created_at) SELECT x.id,$1,x.kind,$2,now()+x.n*interval '1 millisecond' FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,kind text,n int)",[company,owner,JSON.stringify(rows)]);
  await admin.query("INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,review_status,author_id) SELECT $1,x.id,1,x.content,x.provenance,'approved',$2 FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,content jsonb,provenance jsonb)",[company,owner,JSON.stringify(rows)]);
  await admin.query('UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=$1',[company]);
  await admin.query('COMMIT');
 }catch(error){await admin.query('ROLLBACK');throw error;}
 // The loaded revisions are legitimate: the protected validator accepts a sample of them (it is the same validator the functions run).
 let sample;
 try{sample=await admin.query('SELECT private.assert_revision(v) FROM public.knowledge_entry_versions v WHERE v.company_id=$1 ORDER BY v.entry_id LIMIT 20',[company]);}
 catch(error){assert.fail(`the protected validator must accept the loaded revisions, but refused one: ${error.message}`);}
 assert.equal(sample.rowCount,20);
}
async function newCompany(user,name){return (await call(user,'public.create_company',[name,'https://max.example',randomUUID()])).create_company;}
async function publish(user,company){
 const generation=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation;
 try{return await call(user,'public.publish_knowledge_base',[company,generation,randomUUID()]);}
 catch(error){return assert.fail(`publication must accept this snapshot, but refused it: ${error.message}`);}
}
const check=payload=>admin.query("SELECT private.validate_json($1::jsonb,private.contract_schema('export'))",[JSON.stringify(payload)]);

test('a maximal legitimate snapshot (500 key people = 4,033 coverage rows) publishes; the SQL export contract refuses one row more',async t=>{
 const user=await connect('authenticated',owner);
 const company=await newCompany(user,'Maximal people');
 await load(company,Array.from({length:500},(_,index)=>entryOf('key_person',index+1)));
 const snapshot=await publish(user,company);
 const {KnowledgeBaseExportSchema}=await tsImport(resolve(root,'src/contracts/index.ts'),import.meta.url);
 await t.test('the published payload has exactly 4,033 coverage rows and 500 claims',()=>{
  assert.equal(snapshot.payload.provenance.coverage.length,MAX_ROWS,'32 singleton fields + 500 x 8 + 1 (/offerings)');
  assert.equal(snapshot.payload.provenance.claims.length,500);assert.equal(snapshot.payload.provenance.entries.length,500);
  assert.equal(snapshot.payload.provenance.coverage.filter(row=>row.targets[0]==='/offerings').length,1);
 });
 await t.test('the TypeScript export schema accepts the same payload and the SQL contract validates it',async()=>{
  assert.equal(KnowledgeBaseExportSchema.safeParse(snapshot.payload).success,true);
  await check(snapshot.payload);
 });
 await t.test('Edge case: one coverage row more is refused by the SQL export contract (array_limit) and by TypeScript',async()=>{
  const over=structuredClone(snapshot.payload);over.provenance.coverage.push(over.provenance.coverage[0]);
  await assert.rejects(check(over),/array_limit/);
  assert.equal(KnowledgeBaseExportSchema.safeParse(over).success,false);
  const far=structuredClone(snapshot.payload);for(let n=0;n<1000;n++)far.provenance.coverage.push(far.provenance.coverage[0]);
  await assert.rejects(check(far),/array_limit/);assert.equal(KnowledgeBaseExportSchema.safeParse(far).success,false);
 });
});

test('500 offerings (4,033 rows) and a mixed 250 + 250 snapshot (4,032 rows) publish too',async t=>{
 const user=await connect('authenticated',owner);
 const offerings=await newCompany(user,'Maximal offerings');
 await load(offerings,Array.from({length:500},(_,index)=>entryOf('offering',index+1)));
 const {KnowledgeBaseExportSchema}=await tsImport(resolve(root,'src/contracts/index.ts'),import.meta.url);
 await t.test('500 offerings: 32 + 500 x 8 + 1 (/key_people) = 4,033 rows',async()=>{
  const snapshot=await publish(user,offerings);
  assert.equal(snapshot.payload.provenance.coverage.length,MAX_ROWS);assert.equal(KnowledgeBaseExportSchema.safeParse(snapshot.payload).success,true);await check(snapshot.payload);
 });
 const mixed=await newCompany(user,'Maximal mixed');
 await load(mixed,[...Array.from({length:250},(_,index)=>entryOf('key_person',index+1)),...Array.from({length:250},(_,index)=>entryOf('offering',index+1))]);
 await t.test('250 people + 250 offerings: 32 + 500 x 8 = 4,032 rows',async()=>{
  const snapshot=await publish(user,mixed);
  assert.equal(snapshot.payload.provenance.coverage.length,MAX_ROWS-1);assert.equal(KnowledgeBaseExportSchema.safeParse(snapshot.payload).success,true);await check(snapshot.payload);
 });
});

test('every entry mix that fitted the old cap still publishes (194 people = 1,585 rows; 190 people + 3 offerings = 1,576 rows)',async t=>{
 const user=await connect('authenticated',owner);
 const {KnowledgeBaseExportSchema}=await tsImport(resolve(root,'src/contracts/index.ts'),import.meta.url);
 await t.test('194 people',async()=>{
  const company=await newCompany(user,'Old maximum people');
  await load(company,Array.from({length:194},(_,index)=>entryOf('key_person',index+1)));
  const snapshot=await publish(user,company);
  assert.equal(snapshot.payload.provenance.coverage.length,32+194*8+1);assert.equal(KnowledgeBaseExportSchema.safeParse(snapshot.payload).success,true);
 });
 await t.test('190 people + 3 offerings',async()=>{
  const company=await newCompany(user,'Old maximum mixed');
  await load(company,[...Array.from({length:190},(_,index)=>entryOf('key_person',index+1)),...Array.from({length:3},(_,index)=>entryOf('offering',index+1))]);
  const snapshot=await publish(user,company);
  assert.equal(snapshot.payload.provenance.coverage.length,32+190*8+3*8);assert.equal(KnowledgeBaseExportSchema.safeParse(snapshot.payload).success,true);
 });
});
