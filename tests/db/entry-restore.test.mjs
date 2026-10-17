// Database tests for restoring a deleted entry (migration 0023): the Undo of "Delete <offering>".
// Needs a disposable PostgreSQL (see scripts/test-db.mjs):
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/entry-restore.test.mjs
// Without TEST_DATABASE_URL this file reports NOT_RUN (it never passes silently).
//
// DECISIONs (coordinator, Q8):
//  - A deleted entry is only archived (0020), so Undo clears its tombstone with public.restore_entry: the entry comes back with
//    every revision and all of its evidence. Creating it again with the same id could never work (the archived row keeps the id).
//  - Owner and editor of a live company; a viewer is forbidden; a non-member finds nothing there; an entry that is not archived is
//    refused (not_archived); the draft generation moves; the tombstone stays immutable to any direct write.
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

const restore=(user,company,entry)=>call(user,'public.restore_entry',[company,entry]).then(row=>row.restore_entry);

test('restoring brings the entry back with its revisions and evidence',async t=>{
 const {company,ids,revs}=await world('Restore');
 await archive(owner,company,ids.shop,revs.shop.revision);
 assert.ok(!(await visible(owner,company)).includes(ids.shop));
 const g=await generation(company);
 const result=await restore(owner,company,ids.shop);
 await t.test('answers the entry and its revision, and moves the draft generation',async()=>{
  assert.deepEqual(result,{id:ids.shop,kind:'offering',revision:revs.shop.revision});
  assert.equal(await generation(company),g+1);
 });
 await t.test('members see it again, with the same revision and content, and the tombstone is gone',async()=>{
  for(const session of [owner,editor,viewer])assert.ok((await visible(session,company)).includes(ids.shop));
  const row=(await admin.query('SELECT archived_at,archived_by,archive_request_id,current_revision FROM public.knowledge_entries WHERE id=$1',[ids.shop])).rows[0];
  assert.deepEqual(row,{archived_at:null,archived_by:null,archive_request_id:null,current_revision:revs.shop.revision});
  const stored=(await owner.query('SELECT content,provenance FROM public.knowledge_entry_versions WHERE entry_id=$1 AND revision=$2',[ids.shop,revs.shop.revision])).rows[0];
  assert.deepEqual(stored.content,revs.shop.content);assert.deepEqual(stored.provenance.claims,revs.shop.provenance.claims);
 });
 await t.test('it takes new revisions again, and can be deleted again',async()=>{
  const content=offering(ids.shop,{name:'Shop Inventory Pro'});
  const next=await call(owner,'public.save_entry_revision',[company,ids.shop,revs.shop.revision,content,provenanceFor('offering',ids.shop,content,ownerId),'approved','Renamed',randomUUID()]);
  assert.equal(next.revision,revs.shop.revision+1);
  await archive(owner,company,ids.shop,next.revision);
  assert.ok(!(await visible(owner,company)).includes(ids.shop));
 });
});

test('an entry that is not archived cannot be restored',async()=>{
 const {company,ids}=await world('NotArchived');
 const g=await generation(company);
 await rejected(restore(owner,company,ids.alex),/not_archived/);
 assert.equal(await generation(company),g);
});

test('who may restore: owner and editor of a live company; everyone else is refused',async t=>{
 await t.test('an editor may',async()=>{
  const {company,ids,revs}=await world('EditorRestore');
  await archive(owner,company,ids.blake,revs.blake.revision);
  await restore(editor,company,ids.blake);
  assert.ok((await visible(owner,company)).includes(ids.blake));
 });
 await t.test('a viewer may not',async()=>{
  const {company,ids,revs}=await world('ViewerRestore');
  await archive(owner,company,ids.blake,revs.blake.revision);
  const g=await generation(company);
  await rejected(restore(viewer,company,ids.blake),/forbidden/);
  assert.ok(!(await visible(owner,company)).includes(ids.blake));assert.equal(await generation(company),g);
 });
 await t.test('a non-member finds nothing there, and learns nothing about the entry',async()=>{
  const {company,ids,revs}=await world('StrangerRestore');
  await archive(owner,company,ids.blake,revs.blake.revision);
  const present=await rejected(restore(stranger,company,ids.blake),/unavailable/);
  const absent=await rejected(restore(stranger,company,randomUUID()),/unavailable/);
  assert.equal(present.message,absent.message);
  assert.ok(!(await visible(owner,company)).includes(ids.blake));
 });
 await t.test('an entry of another company is not found',async()=>{
  const first=await world('First'),second=await world('Second');
  await archive(owner,first.company,first.ids.blake,first.revs.blake.revision);
  await rejected(restore(owner,second.company,first.ids.blake),/unavailable/);
 });
 await t.test('an archived company is refused',async()=>{
  const {company,ids,revs}=await world('ArchivedCompany');
  await archive(owner,company,ids.blake,revs.blake.revision);
  await call(owner,'public.archive_company',[company,await generation(company)]);
  await rejected(restore(owner,company,ids.blake),/company_archived/);
 });
});

test('the tombstone is still immutable to a direct write, and restoring is the only way back',async()=>{
 const {company,ids,revs}=await world('Direct');
 await archive(owner,company,ids.blake,revs.blake.revision);
 await rejected(admin.query('UPDATE public.knowledge_entries SET archived_at=NULL,archived_by=NULL,archive_request_id=NULL WHERE id=$1',[ids.blake]),/immutable_identity/);
 await rejected(owner.query('UPDATE public.knowledge_entries SET archived_at=NULL,archived_by=NULL,archive_request_id=NULL WHERE id=$1',[ids.blake]),/permission denied/);
 await rejected(admin.query("SELECT set_config('private.restoring_entry',$1,false)",[ids.alex]).then(()=>admin.query('UPDATE public.knowledge_entries SET archived_at=NULL,archived_by=NULL,archive_request_id=NULL WHERE id=$1',[ids.blake])),/immutable_identity/,'the flag names one entry only');
 await admin.query("SELECT set_config('private.restoring_entry','',false)");
 assert.ok(!(await visible(owner,company)).includes(ids.blake));
});

test('the singleton kinds cannot be restored (they are never archived)',async()=>{
 const {company,ids}=await world('Singleton');
 const foundationId=(await admin.query("SELECT id FROM public.knowledge_entries WHERE company_id=$1 AND kind='company_foundation'",[company])).rows[0].id;
 await rejected(restore(owner,company,foundationId),/not_archived/);
 assert.ok(ids.alex);
});
