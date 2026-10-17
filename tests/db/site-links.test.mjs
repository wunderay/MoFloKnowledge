// Acceptance tests for Quest Q1 "sitelinks-model", criterion C3 (database) plus the DB side of "same
// save/approve/history/snapshot behaviour" (C1/C4). Needs a disposable PostgreSQL (see scripts/test-db.mjs):
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/site-links.test.mjs
// Without TEST_DATABASE_URL this file reports NOT_RUN (it never passes silently).
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
const original=new URL(supplied);
if(!original.pathname.endsWith('_test'))throw new Error('Test database name must end _test');
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
const root=process.env.CONTRACTS_ROOT??'.';
let administrator,admin;const sessions=[];
const owner=randomUUID(),viewer=randomUUID();
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>Array.isArray(x)?JSON.stringify(x):(x!==null&&typeof x==='object')?JSON.stringify(x):x));return q.rows[0];}
async function rejected(promise,message='must be rejected'){let error=null;try{await promise;}catch(e){error=e;}assert.ok(error,message);return error;}
const link=(n,over={})=>({id:`a4000000-0000-4000-8000-${String(n).padStart(12,'0')}`,title:`Page ${n}`,url:`https://acme.example/page-${n}`,note:null,...over});
const withLinks=(...links)=>({links});
/** User-provided claims for every populated leaf, plus the coverage assessment the field registry requires. */
function provenanceFor(entryId,actor,content,note='The company listed these pages by hand'){
 const targets=content.links.flatMap(item=>['title','url','note'].filter(key=>item&&typeof item==='object'&&item[key]!==null&&item[key]!==undefined).map(key=>`/site_links/links/@${item.id}/${key}`));
 return {sources:[],evidence:[],claims:targets.length?[{id:randomUUID(),entry_id:entryId,targets,origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:actor,authored_at:'2026-10-16T00:00:00.000Z',note}]:[],coverage:[{targets:['/site_links/links'],status:'not_checked',job_id:null,reason:'Entered manually'}],operations:[],conflicts:[],decisions:[]};
}
function claimsFor(entryId,actor,items){
 return {id:randomUUID(),entry_id:entryId,targets:items.flatMap(item=>['title','url','note'].filter(key=>item[key]!==null).map(key=>`/site_links/links/@${item.id}/${key}`)),origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:actor,authored_at:'2026-10-16T00:00:00.000Z',note:'Added by the reviewer'};
}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migration=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});
 const initial=migration();assert.equal(initial.status,0,initial.stderr);
 const files=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql'));
 assert.equal(initial.stdout.match(/Applied /g)?.length,files.length,'every migration file must apply on a fresh database');
 const replay=migration();assert.equal(replay.status,0,replay.stderr);assert.equal(replay.stdout,'','replaying migrations must be a no-op');
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,viewer]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

test('C3: the kind CHECK allows site_links, unknown kinds stay rejected, and the SQL contract functions know the kind',async t=>{
 await t.test('knowledge_entries.kind CHECK lists site_links and the original kinds',async()=>{
  const {rows}=await admin.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.knowledge_entries'::regclass AND contype='c'");
  const kindCheck=rows.map(r=>r.definition).find(d=>/kind/.test(d));assert.ok(kindCheck,'a CHECK on kind must exist');
  for(const kind of ['company_foundation','positioning','market_and_customers','branding_and_style','online_presence','key_person','offering','site_links'])assert.ok(kindCheck.includes(`'${kind}'`),`kind CHECK must allow ${kind}: ${kindCheck}`);
 });
 await t.test('a direct insert of an unknown kind is still a check violation, while site_links passes the CHECK',async()=>{
  const company=randomUUID();
  await admin.query('BEGIN');
  try{
   await admin.query("INSERT INTO public.companies(id,name,website_url,created_by,creation_request_id) VALUES($1,'Direct','https://direct.example',$2,$3)",[company,owner,randomUUID()]);
   await admin.query('SAVEPOINT unknown_kind');
   const bad=await rejected(admin.query("INSERT INTO public.knowledge_entries(company_id,kind,created_by) VALUES($1,'not_a_kind',$2)",[company,owner]),'unknown kind must be rejected');
   assert.equal(bad.code,'23514');assert.match(bad.message,/check/i);
   await admin.query('ROLLBACK TO SAVEPOINT unknown_kind');
   await admin.query("SET CONSTRAINTS ALL DEFERRED");
   await admin.query("INSERT INTO public.knowledge_entries(company_id,kind,created_by) VALUES($1,'site_links',$2)",[company,owner]);
  }finally{await admin.query('ROLLBACK');}
 });
 await t.test('private.contract_schema / business_defaults / field_registry know site_links',async()=>{
  const schema=(await admin.query("SELECT private.contract_schema('site_links') AS v")).rows[0].v;
  assert.ok(schema,'contract_schema(site_links) must exist');assert.equal(schema.type,'object');assert.ok(schema.required.includes('links'));assert.equal(schema.properties.links.type,'array');
  assert.equal((await admin.query("SELECT private.contract_schema('not_a_kind') AS v")).rows[0].v,null);
  assert.deepEqual((await admin.query("SELECT private.business_defaults()->'site_links' AS v")).rows[0].v,{links:[]});
  const registry=(await admin.query('SELECT private.field_registry() AS v')).rows[0].v;
  const field=registry.find(f=>f.path==='/site_links/links');assert.ok(field,'registry must list /site_links/links');assert.equal(field.kind,'site_links');assert.deepEqual(field.default,[]);
  const defaults=JSON.parse(await readFile(resolve(root,'src/contracts/defaults.json'),'utf8'));
  assert.deepEqual((await admin.query('SELECT private.business_defaults() AS v')).rows[0].v,defaults,'SQL defaults must equal defaults.json');
 });
 await t.test('generate-sql-contract --check passes against the migrations',()=>{
  const generated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/generate-sql-contract.mjs',import.meta.url)),'--check',root],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 });
});

test('site_links entries follow the same create/validate/approve/history/snapshot behaviour as other kinds',async t=>{
 const user=await connect('authenticated',owner);const readOnly=await connect('authenticated',viewer);
 const company=(await call(user,'public.create_company',['Acme','https://acme.example',randomUUID()])).create_company;
 await call(user,'public.set_company_member',[company,viewer,'viewer']);
 const first=withLinks(link(1),link(2,{note:'Reviewed by legal'}));
 let entry,rev,snapshot1;

 await t.test('create stores a site_links entry (kind, revision 1, content exactly as given)',async()=>{
  entry=randomUUID();
  rev=await call(user,'public.create_entry',[company,'site_links',first,provenanceFor(entry,owner,first),randomUUID()]);
  assert.equal(rev.revision,1);assert.deepEqual(rev.content,first);
  const row=(await user.query('SELECT kind,current_revision FROM public.knowledge_entries WHERE company_id=$1 AND id=$2',[company,rev.entry_id])).rows[0];
  assert.equal(row.kind,'site_links');assert.equal(row.current_revision,1);entry=rev.entry_id;
 });
 await t.test('a read-only member cannot create site_links entries, a second site_links entry for the company is refused (singleton)',async()=>{
  const denied=await rejected(call(readOnly,'public.create_entry',[company,'site_links',withLinks(),provenanceFor(randomUUID(),viewer,withLinks()),randomUUID()]));assert.match(denied.message,/forbidden|unavailable|permission/);
  const second=await rejected(call(user,'public.create_entry',[company,'site_links',withLinks(link(7)),provenanceFor(randomUUID(),owner,withLinks(link(7))),randomUUID()]),'singleton: second site_links entry');
  assert.equal(second.code,'23505');
  assert.equal((await user.query("SELECT count(*)::int AS n FROM public.knowledge_entries WHERE company_id=$1 AND kind='site_links'",[company])).rows[0].n,1);
 });
 await t.test('an unknown kind is refused by the protected create function',async()=>{
  await rejected(call(user,'public.create_entry',[company,'not_a_kind',{},provenanceFor(randomUUID(),owner,withLinks()),randomUUID()]));
 });
 await t.test('approve, edit (new revision), and the old revision stays immutable history',async()=>{
  rev=await call(user,'public.save_entry_revision',[company,entry,1,first,rev.provenance,'approved','Reviewed',randomUUID()]);assert.equal(rev.revision,2);assert.equal(rev.review_status,'approved');
  const added=link(3,{title:'Security',url:'https://acme.example/security?x=1#top'});
  const edited=withLinks(...first.links,added);
  const provenance=structuredClone(rev.provenance);provenance.claims.push(claimsFor(entry,owner,[added]));
  rev=await call(user,'public.save_entry_revision',[company,entry,2,edited,provenance,'approved','Added security page',randomUUID()]);assert.equal(rev.revision,3);assert.deepEqual(rev.content,edited);
  const history=(await user.query('SELECT id,revision,content,review_status FROM public.knowledge_entry_versions WHERE company_id=$1 AND entry_id=$2 ORDER BY revision',[company,entry])).rows;
  assert.deepEqual(history.map(h=>h.revision),[1,2,3]);assert.deepEqual(history[0].content,first);assert.deepEqual(history[2].content,edited);
  await rejected(admin.query('UPDATE public.knowledge_entry_versions SET content=$1 WHERE id=$2',[withLinks(),history[0].id]),'history must be immutable');
 });
 await t.test('publication freezes approved links into the snapshot, matching the TypeScript assembler',async()=>{
  const c=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0];
  snapshot1=await call(user,'public.publish_knowledge_base',[company,c.draft_generation,randomUUID()]);
  assert.deepEqual(snapshot1.payload.site_links,withLinks(...rev.content.links));assert.equal(snapshot1.payload.site_links.links.length,3);
  assert.ok(snapshot1.payload.provenance.entries.some(e=>e.kind==='site_links'&&e.entry_id===entry));
  assert.ok(snapshot1.payload.provenance.coverage.some(item=>item.targets.includes('/site_links/links')));
  assert.ok(snapshot1.payload.provenance.claims.some(claim=>claim.targets.some(target=>target.startsWith('/site_links/links/@'))));
  const {assembleKnowledgeBase}=await tsImport(resolve(root,'src/knowledge/assemble.ts'),import.meta.url);
  const rows=(await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[company])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
  assert.deepEqual(snapshot1.payload,assembleKnowledgeBase({company:{id:company,name:'Acme',website:'https://acme.example'},snapshotId:snapshot1.id,version:1,savedAt:snapshot1.created_at.toISOString(),authorId:owner,entries:rows}));
 });
 await t.test('revert creates a new revision; a later snapshot differs but the earlier snapshot is unchanged',async()=>{
  const reverted=await call(user,'public.revert_entry',[company,entry,1,3,randomUUID()]);assert.equal(reverted.revision,4);assert.deepEqual(reverted.content,first);
  const approved=await call(user,'public.save_entry_revision',[company,entry,4,reverted.content,reverted.provenance,'approved','Back to the two original pages',randomUUID()]);assert.equal(approved.revision,5);
  const c=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0];
  const snapshot2=await call(user,'public.publish_knowledge_base',[company,c.draft_generation,randomUUID()]);
  assert.equal(snapshot2.payload.site_links.links.length,2);assert.deepEqual(snapshot2.payload.site_links,first);
  const stored=(await user.query('SELECT payload FROM public.knowledge_base_versions WHERE id=$1',[snapshot1.id])).rows[0].payload;assert.equal(stored.site_links.links.length,3);
 });
 await t.test('Edge case: invalid link content is refused on update (relative URL, javascript:, duplicate ids)',async()=>{
  const current=(await user.query('SELECT r.* FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 AND e.id=$2',[company,entry])).rows[0];
  const control=withLinks(...current.content.links,link(4));const controlProvenance=structuredClone(current.provenance);controlProvenance.claims.push(claimsFor(entry,owner,[link(4)]));
  const ok=await call(user,'public.save_entry_revision',[company,entry,current.revision,control,controlProvenance,'unreviewed','valid control',randomUUID()]);assert.equal(ok.revision,current.revision+1);
  const known=new Set([link(1).id,link(2).id,link(4).id]);
  for(const [name,bad] of [
   ['relative url',withLinks(link(1),link(2),link(4),link(5,{url:'/relative/path'}))],
   ['scheme-less url',withLinks(link(1),link(2),link(4),link(5,{url:'acme.example/about'}))],
   ['javascript scheme',withLinks(link(1),link(2),link(4),link(5,{url:'javascript:alert(1)'}))],
   ['uppercase javascript scheme',withLinks(link(1),link(2),link(4),link(5,{url:'JAVASCRIPT:alert(1)'}))],
   ['data scheme',withLinks(link(1),link(2),link(4),link(5,{url:'data:text/html,hi'}))],
   ['ftp scheme',withLinks(link(1),link(2),link(4),link(5,{url:'ftp://acme.example/file'}))],
   ['credentials in url',withLinks(link(1),link(2),link(4),link(5,{url:'https://user:pw@acme.example/'}))],
   ['empty title',withLinks(link(1),link(2),link(4),link(5,{title:''}))],
   ['whitespace-only title',withLinks(link(1),link(2),link(4),link(5,{title:'   '}))],
   ['missing id',withLinks(link(1),link(2),link(4),(({id:_,...rest})=>rest)(link(5)))],
   ['non-uuid id',withLinks(link(1),link(2),link(4),link(5,{id:'not-a-uuid'}))],
   ['duplicate ids',withLinks(link(1),link(2),link(4),link(5,{id:link(1).id}))],
   ['unknown key on item',withLinks(link(1),link(2),link(4),link(5,{rogue:true}))],
   ['unknown key on entry',{links:[link(1),link(2),link(4)],rogue:true}],
   ['non-array links',{links:link(1)}],
  ]){
   const provenance=structuredClone(ok.provenance);
   const fresh=Array.isArray(bad.links)?bad.links.filter(item=>item&&typeof item==='object'&&typeof item.id==='string'&&!known.has(item.id)):[];
   if(fresh.length)provenance.claims.push(claimsFor(entry,owner,fresh.map(item=>({note:null,title:null,url:null,...item}))));
   await rejected(call(user,'public.save_entry_revision',[company,entry,ok.revision,bad,provenance,'unreviewed',name,randomUUID()]),`${name} must be rejected by the database`);
  }
  assert.equal((await user.query('SELECT current_revision FROM public.knowledge_entries WHERE company_id=$1 AND id=$2',[company,entry])).rows[0].current_revision,ok.revision,'rejected saves must not create revisions');
 });
 await t.test('Edge case: an empty links list is valid content',async()=>{
  const current=(await user.query('SELECT current_revision FROM public.knowledge_entries WHERE company_id=$1 AND id=$2',[company,entry])).rows[0].current_revision;
  const saved=await call(user,'public.save_entry_revision',[company,entry,current,withLinks(),provenanceFor(entry,owner,withLinks()),'approved','No internal pages',randomUUID()]);
  assert.deepEqual(saved.content,{links:[]});assert.equal(saved.review_status,'approved');
 });
});

test('Edge case: invalid link content is refused on create, and the same shape with valid values is accepted',async t=>{
 const user=await connect('authenticated',owner);
 const company=(await call(user,'public.create_company',['Beta','https://beta.example',randomUUID()])).create_company;
 const attempt=content=>call(user,'public.create_entry',[company,'site_links',content,provenanceFor(randomUUID(),owner,{links:Array.isArray(content.links)?content.links.filter(i=>i&&typeof i==='object'&&i.id):[]}),randomUUID()]);
 for(const [name,bad] of [
  ['relative url',withLinks(link(1,{url:'/about'}))],
  ['javascript scheme',withLinks(link(1,{url:'javascript:alert(1)'}))],
  ['mixed-case javascript scheme',withLinks(link(1,{url:'JaVaScRiPt:alert(1)'}))],
  ['data scheme',withLinks(link(1,{url:'data:text/plain,hi'}))],
  ['ftp scheme',withLinks(link(1,{url:'ftp://acme.example/'}))],
  ['empty title',withLinks(link(1,{title:''}))],
  ['missing id',withLinks((({id:_,...rest})=>rest)(link(1)))],
  ['duplicate ids',withLinks(link(1),link(2,{id:link(1).id}))],
 ])await t.test(`rejects ${name}`,async()=>{await rejected(attempt(bad),`${name} must be rejected`);});
 await t.test('nothing was stored by the rejected attempts',async()=>{
  assert.equal((await user.query("SELECT count(*)::int AS n FROM public.knowledge_entries WHERE company_id=$1",[company])).rows[0].n,0);
 });
 await t.test('the valid control is accepted',async()=>{
  const ok=await attempt(withLinks(link(1),link(2)));assert.equal(ok.revision,1);
 });
});

test('C3: site_links is OPTIONAL in the first import, and companies without a site_links entry publish an empty one',async t=>{
 const user=await connect('authenticated',owner);const worker=await connect('moflo_worker');
 const c=(await call(user,'public.create_company',['Imported','https://import.example',randomUUID()])).create_company;
 const enqueued=await call(user,'public.enqueue_scrape',[c,'https://import.example',{max_pages:10,max_depth:2},randomUUID()]);
 const claimed=(await worker.query("SELECT private.claim_job('first-import') AS job")).rows[0].job;assert.equal(claimed.id,enqueued.id);
 const {createHash}=await import('node:crypto');
 const text='Acme builds software.';
 const capture={normalized_url:'https://import.example/',final_url:'https://import.example/',title:'Imported',retrieved_at:'2026-10-16T00:00:00.000Z',response_status:200,capture_status:'captured',capture_method:'http',cleaned_content:text,content_sha256:createHash('sha256').update(text).digest('hex'),observations:{segments:[{id:'s1',text}]},design_evidence:{observations:[]}};
 const source=await call(worker,'private.insert_source_capture',[claimed.id,c,claimed.lease_token,capture]);
 const defaults=JSON.parse(await readFile(resolve(root,'src/contracts/defaults.json'),'utf8'));
 const fields=JSON.parse(await readFile(resolve(root,'src/contracts/field-registry.json'),'utf8'));
 const singletons=['company_foundation','positioning','market_and_customers','branding_and_style','online_presence'];
 const metadata={id:source.id,url:source.final_url,title:source.title,author:null,site_name:null,published_on:null,retrieved_at:source.retrieved_at.toISOString()};
 const evidence={id:randomUUID(),source_page_id:source.id,kind:'text',excerpt:text,technical:null};
 const pitchEntry=randomUUID();
 const candidates=singletons.map(kind=>kind==='positioning'
  ?{id:randomUUID(),kind,target_entry_id:null,base_revision:null,schema_version:'1.0.0',content:{company_pitch:text,founding_story:null},provenance:{sources:[metadata],evidence:[evidence],claims:[{id:randomUUID(),entry_id:pitchEntry,targets:['/positioning/company_pitch'],origin:'source_backed',evidence_ids:[evidence.id],based_on_claim_ids:[],actor_id:null,authored_at:null,note:null}],coverage:[{targets:fields.filter(f=>f.kind===kind).map(f=>f.path),status:'partial',job_id:claimed.id,reason:'Bounded fixture evidence'}],operations:[],conflicts:[],decisions:[]},conflicts:[]}
  :{id:randomUUID(),kind,target_entry_id:null,base_revision:null,schema_version:'1.0.0',content:defaults[kind],provenance:{sources:[],evidence:[],claims:[],coverage:[{targets:fields.filter(f=>f.kind===kind).map(f=>f.path),status:'not_checked',job_id:claimed.id,reason:'No checked fixture observation'}],operations:[],conflicts:[],decisions:[]},conflicts:[]});
 const progress={stage:'crawling',discovered:1,selected:1,captured:1,failed:0,blocked:0,extracted:0,document_limit:10,limits_reached:[]};
 await call(worker,'private.checkpoint_job',[claimed.id,c,claimed.lease_token,{},progress]);await call(worker,'private.checkpoint_job',[claimed.id,c,claimed.lease_token,{},{...progress,stage:'extracting',extracted:1}]);
 const finished=await call(worker,'private.finish_job',[claimed.id,c,claimed.lease_token,{candidates,decisions:[]},[{targets:['/positioning/company_pitch'],status:'partial',job_id:claimed.id,reason:'Fixture limitation'}]]);
 await t.test('[non-regression] a first import with only the five original singletons succeeds and creates no site_links entry',async()=>{
 assert.equal(finished.proposals.initialized_entry_ids.length,5,'five singletons must be enough for a first import');
 const kinds=(await user.query('SELECT kind FROM public.knowledge_entries WHERE company_id=$1 ORDER BY kind',[c])).rows.map(r=>r.kind);
 assert.deepEqual(kinds,[...singletons].sort(),'a first import must not create or require a site_links entry');
 });
 await t.test('[behavioural] the published snapshot carries site_links = { links: [] } with a not-assessed coverage row, identical to the TypeScript assembler',async()=>{
 for(const r of (await user.query('SELECT * FROM public.knowledge_entry_versions WHERE company_id=$1',[c])).rows)await call(user,'public.save_entry_revision',[c,r.entry_id,1,r.content,r.provenance,'approved','Fixture review',randomUUID()]);
 const generation=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[c])).rows[0].draft_generation;
 const snapshot=await call(user,'public.publish_knowledge_base',[c,generation,randomUUID()]);
 assert.deepEqual(snapshot.payload.site_links,{links:[]},'snapshots without a site_links entry carry the empty default');
 const gap=snapshot.payload.provenance.coverage.find(item=>item.targets.includes('/site_links/links'));
 assert.ok(gap,'coverage lists /site_links/links');assert.equal(gap.status,'not_checked');assert.equal(gap.reason,'No approved entry assessed this field.');
 const {assembleKnowledgeBase}=await tsImport(resolve(root,'src/knowledge/assemble.ts'),import.meta.url);
 const rows=(await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[c])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
 assert.deepEqual(snapshot.payload,assembleKnowledgeBase({company:{id:c,name:'Imported',website:'https://import.example'},snapshotId:snapshot.id,version:1,savedAt:snapshot.created_at.toISOString(),authorId:owner,entries:rows}));
 });
});
