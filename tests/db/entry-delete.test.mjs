// Acceptance tests for Quest Q9 "key-people", the database side of deleting a key person (migration 0020).
// Needs a disposable PostgreSQL (see scripts/test-db.mjs):
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/entry-delete.test.mjs
// Without TEST_DATABASE_URL this file reports NOT_RUN (it never passes silently).
//
// DECISIONs (coordinator, Q9):
//  - Deleting is an archive (soft delete): the entry row and every revision stay, existing snapshots are untouched, and a
//    tombstone (archived_at, archived_by, archive_request_id) hides the entry from members, drafts, the next snapshot, the
//    publication manifest and the worker's resume bundle. public.archive_entry sets it; nothing else can.
//  - Only the repeatable kinds (key_person, offering) can be archived. The five singleton kinds never are.
//  - Owner and editor only; a stale revision is a 409; an archived company is refused; a non-member finds nothing there.
//  - The request id makes a retry idempotent: the same request on the same entry answers the same way and archives once.
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
let administrator,url,admin;const sessions=[];
const [ownerId,editorId,viewerId,strangerId]=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
async function connect(role,user){const c=new pg.Client({connectionString:url});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));return q.rows[0];}
async function rejected(promise,pattern,message='must be rejected'){let error=null;try{await promise;}catch(e){error=e;}assert.ok(error,message);if(pattern)assert.match(error.message,pattern,message);return error;}

const person=(id,over={})=>({id,name:'Alex Chen',title:'Founder',role:null,gender:null,background_or_relevance:null,age:null,nationality:null,portrait:null,...over});
const offering=(id,over={})=>({id,name:'Shop Inventory',description:null,offering_type:null,category:null,features:[],pricing:null,url:null,images:[],...over});
const foundation=(over={})=>({overview:'We build software.',revenue:null,website:null,industry:null,business_model:null,company_role:[],year_founded:null,legal_entity_type:null,employee_count:null,main_address:null,other_locations:[],service_locations:[],alternative_company_names:[],...over});
const FIELDS={company_foundation:['overview','revenue','website','industry','business_model','company_role','year_founded','legal_entity_type','employee_count','main_address','other_locations','service_locations','alternative_company_names'],key_person:['name','title','role','gender','background_or_relevance','age','nationality','portrait'],offering:['name','description','offering_type','category','features','pricing','url','images']};
const rootOf=(kind,id)=>kind==='key_person'?`/key_people/@${id}`:kind==='offering'?`/offerings/@${id}`:`/${kind}`;
function leaves(value,path,out=[]){
 if(value===null||value===undefined)return out;
 if(Array.isArray(value)){value.forEach((item,index)=>leaves(item,`${path}/${item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.id==='string'?'@'+item.id:index}`,out));return out;}
 if(typeof value==='object'){for(const [key,item] of Object.entries(value))if(key!=='id')leaves(item,`${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`,out);return out;}
 if(value==='')return out;out.push(path);return out;
}
function provenanceFor(kind,entryId,content,actor){
 const base=rootOf(kind,entryId),targets=leaves(content,base);
 return {sources:[],evidence:[],claims:targets.length?[{id:randomUUID(),entry_id:entryId,targets,origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:actor,authored_at:'2026-10-17T00:00:00.000Z',note:'Entered by hand'}]:[],
  coverage:FIELDS[kind].map(field=>({targets:[`${base}/${field}`],status:'not_checked',job_id:null,reason:'Entered manually'})),operations:[],conflicts:[],decisions:[]};
}
async function createEntry(user,company,kind,content,actor=ownerId){
 const entry=kind==='key_person'||kind==='offering'?content.id:randomUUID();
 return call(user,'public.create_entry',[company,kind,content,provenanceFor(kind,entry,content,actor),randomUUID()]);
}
async function approve(user,company,rev,actor=ownerId){return call(user,'public.save_entry_revision',[company,rev.entry_id,rev.revision,rev.content,provenanceFor(rev.kind??'key_person',rev.entry_id,rev.content,actor),'approved','Reviewed',randomUUID()]);}
async function newCompany(user,name='Acme'){return (await call(user,'public.create_company',[name,'https://acme.example',randomUUID()])).create_company;}
const generation=async company=>Number((await admin.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation);
const archive=(user,company,entry,revision,request=randomUUID())=>call(user,'public.archive_entry',[company,entry,revision,request]).then(row=>row.archive_entry);
const visible=async(user,company)=>(await user.query('SELECT id FROM public.knowledge_entries WHERE company_id=$1 ORDER BY created_at,id',[company])).rows.map(r=>r.id);
async function publish(user,company){return call(user,'public.publish_knowledge_base',[company,await generation(company),randomUUID()]);}
async function snapshotRows(user,company){
 return (await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[company])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
}
async function assembled(user,company,snapshot,name){
 const {assembleKnowledgeBase}=await tsImport(resolve(root,'src/knowledge/assemble.ts'),import.meta.url);
 return assembleKnowledgeBase({company:{id:company,name,website:'https://acme.example'},snapshotId:snapshot.id,version:Number(snapshot.version_number),savedAt:snapshot.created_at.toISOString(),authorId:ownerId,entries:await snapshotRows(user,company)});
}

let owner,editor,viewer,stranger,worker;
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();
 const name=`moflo_${randomUUID().replaceAll('-','')}_test`;await administrator.query(`CREATE DATABASE "${name}"`);
 const u=new URL(supplied);u.pathname='/'+name;url=u.href;
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const run=()=>spawnSync(process.execPath,[migrateScript],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});
 const initial=run();assert.equal(initial.status,0,initial.stderr);
 const files=(await readdir(migrationsDirectory)).filter(x=>x.endsWith('.sql'));
 assert.equal(initial.stdout.match(/Applied /g)?.length,files.length,'every migration file must apply on a fresh database');
 const replay=run();assert.equal(replay.status,0,replay.stderr);assert.equal(replay.stdout,'','replaying migrations must be a no-op');
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4)',[ownerId,editorId,viewerId,strangerId]);
 owner=await connect('authenticated',ownerId);editor=await connect('authenticated',editorId);viewer=await connect('authenticated',viewerId);stranger=await connect('authenticated',strangerId);worker=await connect('moflo_worker');
});
after(async()=>{for(const c of sessions)await c.end().catch(()=>{});if(administrator){await administrator.query(`DROP DATABASE IF EXISTS "${new URL(url).pathname.slice(1)}"`).catch(()=>{});await administrator.end();}});

/** A company with an owner, an editor and a viewer, and one approved person, offering and Company Foundation. */
async function world(label='Acme'){
 const company=await newCompany(owner,label);
 await call(owner,'public.set_company_member',[company,editorId,'editor']);await call(owner,'public.set_company_member',[company,viewerId,'viewer']);
 const ids={alex:randomUUID(),blake:randomUUID(),shop:randomUUID()};
 const revs={};
 revs.foundation=await approve(owner,company,{...await createEntry(owner,company,'company_foundation',foundation()),kind:'company_foundation'});
 revs.alex=await approve(owner,company,await createEntry(owner,company,'key_person',person(ids.alex)));
 revs.blake=await approve(owner,company,await createEntry(owner,company,'key_person',person(ids.blake,{name:'Blake Diaz',title:'CTO'})));
 revs.shop=await approve(owner,company,{...await createEntry(owner,company,'offering',offering(ids.shop)),kind:'offering'});
 return {company,ids,revs};
}

test('the migration is new (0020), recorded as applied, and 0001-0019 are still there',async()=>{
 const files=(await readdir(migrationsDirectory)).filter(x=>x.endsWith('.sql')).sort();
 for(let n=1;n<=19;n++)assert.ok(files.some(f=>f.startsWith(String(n).padStart(4,'0')+'_')),`migration ${n}`);
 assert.ok(files.some(f=>f.startsWith('0020_')),'migration 0020');
 const {rows}=await admin.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
 assert.ok(rows.map(r=>r.version).includes('0020'));assert.equal(rows.length,files.length);
});

test('archiving: the entry leaves the draft but its history and tombstone stay',async t=>{
 const {company,ids,revs}=await world();
 const before=await generation(company);
 let result;
 const request=randomUUID();
 await t.test('an owner archives a person at the revision they saw',async()=>{
  result=await archive(owner,company,ids.alex,revs.alex.revision,request);
  assert.deepEqual(Object.keys(result).sort(),['archived_at','id','kind','revision']);
  assert.equal(result.id,ids.alex);assert.equal(result.kind,'key_person');assert.equal(result.revision,revs.alex.revision);assert.match(result.archived_at,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(await generation(company),before+1,'the draft changed, so its generation moves');
 });
 await t.test('members see neither the entry nor its revisions any more; the other entries are untouched',async()=>{
  for(const [name,session] of [['owner',owner],['editor',editor],['viewer',viewer]]){
   const ids_=await visible(session,company);assert.ok(!ids_.includes(ids.alex),`${name} must not see the archived person`);assert.equal(ids_.length,3,`${name} still sees the three others`);
   assert.equal((await session.query('SELECT 1 FROM public.knowledge_entry_versions WHERE company_id=$1 AND entry_id=$2',[company,ids.alex])).rowCount,0,`${name} must not see its revisions`);
  }
 });
 await t.test('the tombstone and every revision remain in the database; revisions are still immutable',async()=>{
  const row=(await admin.query('SELECT archived_at,archived_by,archive_request_id,current_revision FROM public.knowledge_entries WHERE id=$1',[ids.alex])).rows[0];
  assert.ok(row.archived_at instanceof Date);assert.equal(row.archived_by,ownerId);assert.equal(row.archive_request_id,request);assert.equal(row.current_revision,revs.alex.revision);
  assert.equal((await admin.query('SELECT count(*)::int n FROM public.knowledge_entry_versions WHERE entry_id=$1',[ids.alex])).rows[0].n,revs.alex.revision);
  await rejected(admin.query('DELETE FROM public.knowledge_entry_versions WHERE entry_id=$1',[ids.alex]),/immutable_record|permission denied/);
 });
 await t.test('the tombstone cannot be changed, removed or forged by a direct write',async()=>{
  await rejected(admin.query('UPDATE public.knowledge_entries SET archived_at=NULL,archived_by=NULL,archive_request_id=NULL WHERE id=$1',[ids.alex]),/immutable_identity/);
  await rejected(admin.query('UPDATE public.knowledge_entries SET archived_at=now() WHERE id=$1',[ids.alex]),/immutable_identity/);
  await rejected(admin.query('UPDATE public.knowledge_entries SET current_revision=current_revision+1 WHERE id=$1',[ids.alex]),/immutable_identity|violates/);
  await rejected(admin.query('UPDATE public.knowledge_entries SET archived_at=now() WHERE id=$1',[ids.blake]),/violates check constraint/,'a half tombstone violates the CHECK');
  await rejected(owner.query('UPDATE public.knowledge_entries SET archived_at=now() WHERE id=$1',[ids.blake]),/permission denied/,'members cannot write the table');
  assert.deepEqual((await admin.query('SELECT archived_at FROM public.knowledge_entries WHERE id=$1',[ids.blake])).rows[0],{archived_at:null});
 });
 await t.test('no revision of any kind is written to an archived entry',async()=>{
  const content=person(ids.alex,{name:'Alex Chen-Smith'});
  await rejected(call(owner,'public.save_entry_revision',[company,ids.alex,revs.alex.revision,content,provenanceFor('key_person',ids.alex,content,ownerId),'unreviewed','Edit',randomUUID()]),/unavailable_archived_entry/);
  await rejected(call(owner,'public.revert_entry',[company,ids.alex,1,revs.alex.revision,randomUUID()]),/unavailable_archived_entry/);
  await rejected(admin.query("INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) SELECT company_id,entry_id,revision+1,content,provenance,author_id FROM public.knowledge_entry_versions WHERE entry_id=$1 AND revision=$2",[ids.alex,revs.alex.revision]),/unavailable_archived_entry/);
  assert.equal((await admin.query('SELECT count(*)::int n FROM public.knowledge_entry_versions WHERE entry_id=$1',[ids.alex])).rows[0].n,revs.alex.revision);
 });
});

test('idempotency: the same request is answered once; another request finds nothing',async t=>{
 const {company,ids,revs}=await world('Idempotent');
 const request=randomUUID();
 const first=await archive(owner,company,ids.alex,revs.alex.revision,request);
 const generationAfter=await generation(company);
 await t.test('repeating the request returns the same answer and changes nothing',async()=>{
  assert.deepEqual(await archive(owner,company,ids.alex,revs.alex.revision,request),first);
  assert.deepEqual(await archive(editor,company,ids.alex,revs.alex.revision,request),first,'a retry from another editor of the same company is the same request');
  assert.equal(await generation(company),generationAfter);
  assert.equal((await admin.query('SELECT count(*)::int n FROM public.knowledge_entries WHERE company_id=$1 AND archived_at IS NOT NULL',[company])).rows[0].n,1);
 });
 await t.test('the same request with a different revision is an idempotency conflict',async()=>{
  await rejected(archive(owner,company,ids.alex,revs.alex.revision+1,request),/idempotency_conflict/);
 });
 await t.test('another request for an archived entry finds nothing',async()=>{
  await rejected(archive(owner,company,ids.alex,revs.alex.revision),/unavailable/);
 });
 await t.test('one request cannot archive two entries',async()=>{
  await rejected(archive(owner,company,ids.blake,revs.blake.revision,request),/idempotency_conflict/);
  assert.ok((await visible(owner,company)).includes(ids.blake));
 });
 await t.test('a request id already used by a save is refused',async()=>{
  const used=(await admin.query("SELECT o->>'request_id' AS request FROM public.knowledge_entry_versions v,jsonb_array_elements(v.provenance->'operations') o WHERE v.entry_id=$1 LIMIT 1",[ids.blake])).rows[0].request;
  assert.ok(used);
  await rejected(archive(owner,company,ids.blake,revs.blake.revision,used),/idempotency_conflict/);
 });
 await t.test('a request is required',async()=>{
  await rejected(call(owner,'public.archive_entry',[company,ids.blake,revs.blake.revision,null]),/request_required/);
 });
});

test('a stale revision is refused with the current one, and nothing is archived',async()=>{
 const {company,ids,revs}=await world('Stale');
 const content=person(ids.alex,{title:'Founder and CEO'});
 const newer=await call(owner,'public.save_entry_revision',[company,ids.alex,revs.alex.revision,content,provenanceFor('key_person',ids.alex,content,ownerId),'approved','Promoted',randomUUID()]);
 const error=await rejected(archive(owner,company,ids.alex,revs.alex.revision),/stale_revision/);
 assert.equal(JSON.parse(error.detail).currentRevision,newer.revision);
 assert.ok((await visible(owner,company)).includes(ids.alex));
 assert.equal(await archive(owner,company,ids.alex,newer.revision).then(r=>r.revision),newer.revision);
});

test('who may delete: owner and editor of a live company; everyone else is refused',async t=>{
 await t.test('an editor may',async()=>{
  const {company,ids,revs}=await world('Editor');
  await archive(editor,company,ids.blake,revs.blake.revision);
  assert.ok(!(await visible(owner,company)).includes(ids.blake));
 });
 await t.test('a viewer may not',async()=>{
  const {company,ids,revs}=await world('Viewer');
  const g=await generation(company);
  await rejected(archive(viewer,company,ids.blake,revs.blake.revision),/forbidden/);
  assert.ok((await visible(owner,company)).includes(ids.blake));assert.equal(await generation(company),g);
 });
 await t.test('a non-member finds nothing there, and learns nothing about the entry',async()=>{
  const {company,ids,revs}=await world('Stranger');
  const present=await rejected(archive(stranger,company,ids.blake,revs.blake.revision),/unavailable/);
  const absent=await rejected(archive(stranger,company,randomUUID(),1),/unavailable/);
  assert.equal(present.message,absent.message);assert.equal(present.code,absent.code);
  assert.ok((await visible(owner,company)).includes(ids.blake));
 });
 await t.test('a person from another company cannot be archived through this one',async()=>{
  const a=await world('Tenant A'),b=await world('Tenant B');
  await rejected(archive(owner,a.company,b.ids.alex,b.revs.alex.revision),/unavailable/);
  assert.ok((await visible(owner,b.company)).includes(b.ids.alex));
 });
 await t.test('a signed-out caller and the anonymous role cannot',async()=>{
  const {company,ids,revs}=await world('Signed out');
  const signedOut=await connect('authenticated');
  await rejected(archive(signedOut,company,ids.blake,revs.blake.revision),/unavailable/);
  const anonymous=await connect('anon');
  await rejected(archive(anonymous,company,ids.blake,revs.blake.revision),/permission denied/);
 });
 await t.test('an archived company refuses (nothing changes)',async()=>{
  const {company,ids,revs}=await world('Closed');
  const generation_=await generation(company);
  await call(owner,'public.archive_company',[company,generation_]);
  await rejected(archive(owner,company,ids.blake,revs.blake.revision),/company_archived/);
  assert.equal((await admin.query('SELECT count(*)::int n FROM public.knowledge_entries WHERE company_id=$1 AND archived_at IS NOT NULL',[company])).rows[0].n,0);
 });
});

test('only repeatable kinds can be deleted: the five singleton kinds never are',async()=>{
 const {company,revs}=await world('Singletons');
 await rejected(archive(owner,company,revs.foundation.entry_id,revs.foundation.revision),/invalid_entry_kind/);
 assert.ok((await visible(owner,company)).includes(revs.foundation.entry_id));
 await rejected(admin.query("UPDATE public.knowledge_entries SET archived_at=now(),archived_by=$2,archive_request_id=$3 WHERE id=$1",[revs.foundation.entry_id,ownerId,randomUUID()]),/invalid_entry_kind/,'not even a direct write can tombstone a singleton');
 // an offering is repeatable and may be archived
 const {rows}=await owner.query("SELECT id,current_revision FROM public.knowledge_entries WHERE company_id=$1 AND kind='offering'",[company]);
 assert.equal((await archive(owner,company,rows[0].id,rows[0].current_revision)).kind,'offering');
});

test('publication and snapshots: the deleted person is left out of the next version, earlier versions keep them',async t=>{
 const {company,ids,revs}=await world('Publication');
 const first=await publish(owner,company);
 assert.deepEqual(first.payload.key_people.map(p=>p.id).sort(),[ids.alex,ids.blake].sort());
 await archive(owner,company,ids.alex,revs.alex.revision);
 await t.test('the next snapshot has neither the person, their claims, their coverage, nor a manifest row',async()=>{
  const second=await publish(owner,company);
  assert.deepEqual(second.payload.key_people.map(p=>p.id),[ids.blake]);
  const text=JSON.stringify(second.payload);assert.ok(!text.includes(ids.alex),'no trace of the deleted person in the payload');
  assert.ok(!second.entry_manifest.some(m=>m.entry_id===ids.alex));assert.equal(second.entry_manifest.length,first.entry_manifest.length-1);
  assert.deepEqual(second.payload.provenance.entries.map(e=>e.entry_id).includes(ids.alex),false);
  assert.deepEqual(second.payload,await assembled(owner,company,second,'Publication'),'the SQL assembler and the TypeScript assembler still agree');
 });
 await t.test('the version published before the deletion is unchanged',async()=>{
  const stored=(await owner.query('SELECT payload,payload_sha256 FROM public.knowledge_base_versions WHERE id=$1',[first.id])).rows[0];
  assert.equal(stored.payload_sha256,first.payload_sha256);assert.deepEqual(stored.payload,first.payload);
  assert.ok(stored.payload.key_people.some(p=>p.id===ids.alex&&p.name==='Alex Chen'));
 });
 await t.test('the publication check does not read the archived entry either: a draft whose only unreviewed entry is deleted publishes',async()=>{
  const draft=await world('Unreviewed');
  const extra=randomUUID();
  const created=await createEntry(owner,draft.company,'key_person',person(extra,{name:'Casey Poe'}));
  await rejected(publish(owner,draft.company),/unreviewed_entries/,'an unreviewed person blocks publication');
  await archive(owner,draft.company,extra,created.revision);
  const ok=await publish(owner,draft.company);assert.ok(!JSON.stringify(ok.payload).includes(extra));
 });
 await t.test('deleting the last approved entries leaves nothing to publish',async()=>{
  const lone=await newCompany(owner,'Lone');
  const id=randomUUID();const rev=await approve(owner,lone,await createEntry(owner,lone,'key_person',person(id)));
  await archive(owner,lone,id,rev.revision);
  await rejected(publish(owner,lone),/no_approved_entries|empty_manifest/);
 });
});

test('the worker resume bundle lists live entries only',async()=>{
 const {company,ids,revs}=await world('Worker');
 await archive(owner,company,ids.alex,revs.alex.revision);
 const job=await call(owner,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
 const claimed=(await worker.query("SELECT private.claim_job('entry-delete') AS job")).rows[0].job;
 assert.equal(claimed.id,job.id);
 assert.deepEqual(claimed.current_entries.map(e=>e.id).sort(),[revs.foundation.entry_id,ids.blake,ids.shop].sort());
});
