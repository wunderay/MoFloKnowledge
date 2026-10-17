// Entries saved before migration 0019 carry none of the model fields. Reverting to such a revision, applying a stored
// scrape proposal onto such an entry (which merges the proposal into the saved content) and publishing the result
// must keep working: the missing fields read as their defaults and gain "not checked" coverage.
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
const root=process.env.CONTRACTS_ROOT??'.';
const migrationsDirectory=new URL('../../supabase/migrations/',import.meta.url);
const migrateScript=fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url));
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
let administrator,admin,user;const sessions=[];
const owner=randomUUID();
async function connect(role,subject){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(subject)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[subject]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));return q.rows[0];}
async function ok(promise,label){try{return await promise;}catch(error){assert.fail(`${label}: the database must accept this, but refused it: ${error.message} :: ${error.where}`);}}
const migrationNumber=file=>Number.parseInt(file.split('_')[0],10);
/** Applies migration files like scripts/migrate.mjs does, for the files accepted by `include`. */
async function applyMigrations(include){
 const client=new pg.Client({connectionString:url.href});await client.connect();
 try{
  await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
  await client.query('CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text)');
  for(const file of (await readdir(migrationsDirectory)).filter(x=>x.endsWith('.sql')).sort().filter(include)){
   const source=await readFile(new URL(file,migrationsDirectory),'utf8');
   await client.query('BEGIN');
   try{await client.query(source.split('\n').filter(line=>!['BEGIN;','COMMIT;'].includes(line.trim())).join('\n'));await client.query('RESET ROLE');
    await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[file.split('_')[0],file.slice(file.indexOf('_')+1,-4),[source]]);await client.query('COMMIT');}
   catch(error){await client.query('ROLLBACK');throw error;}
  }
 }finally{await client.end();}
}
const registry=JSON.parse(await readFile(resolve(root,'src/contracts/field-registry.json'),'utf8'));
const NEW_PATHS=['/company_foundation/revenue','/online_presence/phone','/key_people/@id/age','/key_people/@id/nationality','/key_people/@id/portrait','/offerings/@id/images'];
const OLD_FIELDS=kind=>registry.filter(f=>f.kind===kind&&!NEW_PATHS.includes(f.path)&&f.kind!=='site_links').map(f=>f.field);
const rootOf=(kind,id)=>kind==='key_person'?`/key_people/@${id}`:`/${kind}`;
const rev0={foundation:{overview:'We build inventory software.',website:null,industry:null,business_model:null,company_role:[],year_founded:null,legal_entity_type:null,employee_count:null,main_address:null,other_locations:[],service_locations:[],alternative_company_names:[]},
 person:id=>({id,name:'Alex Chen',title:'Founder',role:null,gender:null,background_or_relevance:null})};
const claim=(entry,targets)=>({id:randomUUID(),entry_id:entry,targets,origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:owner,authored_at:'2026-10-17T00:00:00.000Z',note:'Entered by hand'});
const coverage=(kind,entry,fields)=>fields.map(field=>({targets:[`${rootOf(kind,entry)}/${field}`],status:'not_checked',job_id:null,reason:'Entered manually'}));
const provenance=(kind,entry,targets,fields)=>({sources:[],evidence:[],claims:[claim(entry,targets.map(t=>`${rootOf(kind,entry)}/${t}`))],coverage:coverage(kind,entry,fields),operations:[],conflicts:[],decisions:[]});
const newFields=kind=>registry.filter(f=>f.kind===kind).map(f=>f.field);
const sorted=rows=>rows.flatMap(r=>r.targets).sort();
const expectedTargets=(kind,entry)=>registry.filter(f=>f.kind===kind).map(f=>f.path.replace('@id','@'+entry)).sort();
const rowFor=(prov,target)=>prov.coverage.filter(c=>c.targets.includes(target));

let company,personId,foundationId,personAtTwo,foundationAtTwo,proposalPerson,proposalPresence;
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 await applyMigrations(file=>migrationNumber(file)<=18);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
 user=await connect('authenticated',owner);
 // Everything below is saved by the pre-0019 schema: no new keys, no new coverage.
 company=(await call(user,'public.create_company',['Legacy','https://legacy.example',randomUUID()])).create_company;
 personId=randomUUID();foundationId=randomUUID();
 const create=async(kind,id,content,targets)=>{
  const made=await call(user,'public.create_entry',[company,kind,content,provenance(kind,id,targets,OLD_FIELDS(kind)),randomUUID()]);
  return call(user,'public.save_entry_revision',[company,made.entry_id,1,content,made.provenance,'approved','Reviewed',randomUUID()]);
 };
 personAtTwo=await create('key_person',personId,rev0.person(personId),['name','title']);
 foundationAtTwo=await create('company_foundation',foundationId,rev0.foundation,['overview']);
 assert.equal(personAtTwo.revision,2);assert.ok(!('age' in personAtTwo.content));
 const proposalPersonId=randomUUID();
 proposalPerson=await create('key_person',proposalPersonId,rev0.person(proposalPersonId),['name','title']);
 const presence=await call(user,'public.create_entry',[company,'online_presence',{social_media_links:[]},{...provenance('online_presence',randomUUID(),[],OLD_FIELDS('online_presence')),claims:[]},randomUUID()]);
 proposalPresence=await call(user,'public.save_entry_revision',[company,presence.entry_id,1,presence.content,presence.provenance,'approved','Reviewed',randomUUID()]);
 const files=(await readdir(migrationsDirectory)).filter(x=>x.endsWith('.sql'));
 const upgrade=spawnSync(process.execPath,[migrateScript],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(upgrade.status,0,upgrade.stderr);
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations')).rows[0].n,files.length);
});
after(async()=>{for(const c of sessions)await c.end().catch(()=>{});if(administrator){await administrator.query(`DROP DATABASE IF EXISTS "${database}"`);await administrator.end();}});

const currentRows=async()=>(await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[company])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
async function publishAndCompare(){
 const generation=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation;
 const snapshot=await ok(call(user,'public.publish_knowledge_base',[company,generation,randomUUID()]),'publish');
 const {assembleKnowledgeBase}=await tsImport(resolve(root,'src/knowledge/assemble.ts'),import.meta.url);
 assert.deepEqual(snapshot.payload,assembleKnowledgeBase({company:{id:company,name:'Legacy',website:'https://legacy.example'},snapshotId:snapshot.id,version:Number(snapshot.version_number),savedAt:snapshot.created_at.toISOString(),authorId:owner,entries:await currentRows()}),'the SQL snapshot equals the TypeScript assembly');
 return snapshot;
}
const approve=async(rev)=>ok(call(user,'public.save_entry_revision',[company,rev.entry_id,rev.revision,rev.content,rev.provenance,'approved','Reviewed again',randomUUID()]),'approve');

test('revert_entry: reverting to a revision saved before 0019 upgrades its content and coverage, and the entry publishes',async t=>{
 // A newer revision using the new fields, then back to the legacy revision 2.
 const editedPerson={...rev0.person(personId),age:41,nationality:'Canadian',portrait:null};
 const editedProvenance=provenance('key_person',personId,['name','title','age','nationality'],newFields('key_person'));
 const rev3=await ok(call(user,'public.save_entry_revision',[company,personId,2,editedPerson,editedProvenance,'approved','Added age',randomUUID()]),'edit with new fields');
 await t.test('a person',async()=>{
  const reverted=await ok(call(user,'public.revert_entry',[company,personId,2,rev3.revision,randomUUID()]),'revert person to the pre-0019 revision');
  assert.equal(reverted.revision,4);
  assert.deepEqual(reverted.content,{...rev0.person(personId),age:null,nationality:null,portrait:null});
  assert.deepEqual(sorted(reverted.provenance.coverage),expectedTargets('key_person',personId),'every registered field has coverage');
  for(const field of ['age','nationality','portrait']){const rows=rowFor(reverted.provenance,`/key_people/@${personId}/${field}`);assert.equal(rows.length,1);assert.equal(rows[0].status,'not_checked');}
  assert.deepEqual(rowFor(reverted.provenance,`/key_people/@${personId}/name`),rowFor(personAtTwo.provenance,`/key_people/@${personId}/name`),'stored assessments are kept');
  await approve(reverted);
 });
 await t.test('a singleton',async()=>{
  const edited={...rev0.foundation,revenue:'$1M ARR'};
  const rev3f=await ok(call(user,'public.save_entry_revision',[company,foundationId,2,edited,provenance('company_foundation',foundationId,['overview','revenue'],newFields('company_foundation')),'approved','Added revenue',randomUUID()]),'edit foundation');
  const reverted=await ok(call(user,'public.revert_entry',[company,foundationId,2,rev3f.revision,randomUUID()]),'revert foundation to the pre-0019 revision');
  assert.equal(reverted.content.revenue,null);assert.equal(reverted.content.overview,rev0.foundation.overview);
  assert.deepEqual(sorted(reverted.provenance.coverage),expectedTargets('company_foundation',foundationId));
  await approve(reverted);
 });
 await t.test('both entries publish',async()=>{
  const snapshot=await publishAndCompare();
  assert.equal(snapshot.payload.key_people[0].age,null);assert.equal(snapshot.payload.company_foundation.revenue,null);
 });
});

/** A finished scrape whose stored proposal targets one entry; written directly, as an earlier crawl would have left it. */
async function seedProposal(candidate){
 const job=randomUUID();
 await admin.query("INSERT INTO public.scrape_jobs(id,company_id,requested_by,request_id,requested_url,status,proposals,finished_at) VALUES($1,$2,$3,$4,'https://legacy.example','succeeded',$5,now())",[job,company,owner,randomUUID(),JSON.stringify({candidates:[candidate],decisions:[]})]);
 return job;
}
test('apply_proposal / merge_saved_proposal: a proposal applied onto an entry saved before 0019 merges into upgraded content',async t=>{
 await t.test('a person',async()=>{
  const approved=proposalPerson,id=approved.entry_id;
  assert.ok(!('age' in approved.content));
  const jobId=randomUUID(),change=randomUUID();
  const proposed={...rev0.person(id),title:'Chief Executive'};
  const candidate={id:randomUUID(),kind:'key_person',target_entry_id:id,base_revision:approved.revision,schema_version:'1.0.0',content:proposed,
   provenance:{...provenance('key_person',id,['name','title'],newFields('key_person')),coverage:newFields('key_person').map(field=>({targets:[`/key_people/@${id}/${field}`],status:field==='title'?'found':'not_checked',job_id:null,reason:field==='title'?null:'Not observed'}))},conflicts:[],changes:[{id:change,target:`/key_people/@${id}/title`}]};
  candidate.content=proposed;
  const job=await seedProposal(candidate);
  const applied=await ok(call(user,'public.apply_proposal',[company,job,candidate.id,id,approved.revision,[change],randomUUID()]),'apply onto a legacy person');
  assert.equal(applied.revision,approved.revision+1);
  assert.deepEqual(applied.content,{...proposed,age:null,nationality:null,portrait:null});
  assert.deepEqual(sorted(applied.provenance.coverage),expectedTargets('key_person',id));
  assert.equal(rowFor(applied.provenance,`/key_people/@${id}/age`)[0].status,'not_checked');
  await approve(applied);
 });
 await t.test('a singleton',async()=>{
  const approved=proposalPresence;
  assert.ok(!('phone' in approved.content));
  const change=randomUUID(),link={id:randomUUID(),platform:'LinkedIn',profile_url:'https://www.linkedin.com/company/legacy'};
  const entry=approved.entry_id;
  const candidate={id:randomUUID(),kind:'online_presence',target_entry_id:entry,base_revision:approved.revision,schema_version:'1.0.0',content:{social_media_links:[link],phone:null},
   provenance:{sources:[],evidence:[],claims:[claim(entry,[`/online_presence/social_media_links/@${link.id}/platform`,`/online_presence/social_media_links/@${link.id}/profile_url`])],coverage:newFields('online_presence').map(field=>({targets:[`/online_presence/${field}`],status:field==='social_media_links'?'found':'not_checked',job_id:null,reason:field==='social_media_links'?null:'Not observed'})),operations:[],conflicts:[],decisions:[]},conflicts:[],changes:[{id:change,target:'/online_presence/social_media_links'}]};
  const job=await seedProposal(candidate);
  const applied=await ok(call(user,'public.apply_proposal',[company,job,candidate.id,entry,approved.revision,[change],randomUUID()]),'apply onto a legacy singleton');
  assert.deepEqual(applied.content,{social_media_links:[link],phone:null});
  assert.deepEqual(sorted(applied.provenance.coverage),expectedTargets('online_presence',entry));
  await approve(applied);
 });
 await t.test('the entries publish',async()=>{await publishAndCompare();});
});

test('a storage reference under another company is refused with a check violation (23514, mapped to HTTP 422)',async()=>{
 const id=randomUUID(),object=randomUUID();
 const content={...rev0.person(id),age:null,nationality:null,portrait:{id:object,path:`portraits/${randomUUID()}/${object}.png`,content_type:'image/png',size_bytes:2048}};
 const targets=['name','title','portrait/path','portrait/content_type','portrait/size_bytes'];
 await assert.rejects(call(user,'public.create_entry',[company,'key_person',content,provenance('key_person',id,targets,newFields('key_person')),randomUUID()]),e=>{assert.equal(e.code,'23514');assert.match(e.message,/asset_company_mismatch/);return true;});
});
