// Acceptance tests for Quest Q5 "model-fields", criterion C5 (database) plus the database side of C1-C4 (every rule is
// enforced in SQL exactly as in TypeScript), C6 (publication of the new fields) and C7 (data saved before 0018 survives
// the migration). Needs a disposable PostgreSQL (see scripts/test-db.mjs):
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/model-fields.test.mjs
// Without TEST_DATABASE_URL this file reports NOT_RUN (it never passes silently).
//
// DECISIONS (see also tests/contracts/model-fields.test.ts): D1 phone is stored as exactly 10 digits (punctuated input is
// rejected or normalised, never stored punctuated; 11 digits are rejected); D3 content_type must match the path extension;
// D4 the company segment of a storage path must be the entry's own company (checked in SQL where the company is known).
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
const generateScript=fileURLToPath(new URL('../../scripts/generate-sql-contract.mjs',import.meta.url));
let administrator;const databases=[];const sessions=[];
const owner=randomUUID();
const urlFor=name=>{const u=new URL(supplied);u.pathname='/'+name;return u.href;};
async function createDatabase(){const name=`moflo_${randomUUID().replaceAll('-','')}_test`;await administrator.query(`CREATE DATABASE "${name}"`);databases.push(name);return urlFor(name);}
async function connect(href,role,user){const c=new pg.Client({connectionString:href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));return q.rows[0];}
/** A valid control the database refuses is a failed assertion (not an incidental error). */
async function ok(promise,label){try{return await promise;}catch(error){assert.fail(`${label}: the database must accept this, but refused it: ${error.message}`);}}
async function rejected(promise,message='must be rejected'){let error=null;try{await promise;}catch(e){error=e;}assert.ok(error,message);return error;}
const UNRELATED=/unclaimed_leaf|coverage_required|claim_target|claim_entry|claim_actor|claim_identity|ambiguous_claim|origin_disallowed|untrusted_operation|request_required|permission denied|stale_|entry_id_mismatch|duplicate_provenance_id/;
/** A rejection is only meaningful when it is the contract that refuses, not a defect of the fixture around the value. */
async function refusedByContract(promise,label){const error=await rejected(promise,`${label} must be rejected by the database`);assert.notEqual(error.code,'23505',`${label}: refused for the wrong reason (${error.message})`);assert.doesNotMatch(error.message,UNRELATED,`${label}: refused for an unrelated reason: ${error.message}`);return error;}

const FOUNDATION_FIELDS=['overview','revenue','website','industry','business_model','company_role','year_founded','legal_entity_type','employee_count','main_address','other_locations','service_locations','alternative_company_names'];
const FIELDS={company_foundation:FOUNDATION_FIELDS,online_presence:['social_media_links','phone'],key_person:['name','title','role','gender','background_or_relevance','age','nationality','portrait'],offering:['name','description','offering_type','category','features','pricing','url','images']};
const OLD_FIELDS={company_foundation:FOUNDATION_FIELDS.filter(f=>f!=='revenue'),online_presence:['social_media_links'],key_person:['name','title','role','gender','background_or_relevance'],offering:['name','description','offering_type','category','features','pricing','url']};
const foundation=(over={})=>({overview:null,revenue:null,website:null,industry:null,business_model:null,company_role:[],year_founded:null,legal_entity_type:null,employee_count:null,main_address:null,other_locations:[],service_locations:[],alternative_company_names:[],...over});
const onlinePresence=(over={})=>({social_media_links:[],phone:null,...over});
const person=(id,over={})=>({id,name:'Alex Chen',title:null,role:null,gender:null,background_or_relevance:null,age:null,nationality:null,portrait:null,...over});
const offering=(id,over={})=>({id,name:'Shop Inventory',description:null,offering_type:null,category:null,features:[],pricing:null,url:null,images:[],...over});
const oldFoundation=()=>{const {revenue:_r,...rest}=foundation();return rest;};
const oldPerson=id=>{const {age:_a,nationality:_n,portrait:_p,...rest}=person(id);return rest;};
const oldOffering=id=>{const {images:_i,...rest}=offering(id);return rest;};
const uuid=(n,prefix='d1000000')=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ref=(company,folder,over={},id=uuid(1,'d2000000'))=>({id,path:`${folder}/${company}/${id}.png`,content_type:'image/png',size_bytes:2048,...over});

const rootOf=(kind,id)=>kind==='key_person'?`/key_people/@${id}`:kind==='offering'?`/offerings/@${id}`:`/${kind}`;
/** Pointers of the populated scalar leaves (what the contract demands a claim for). */
function leaves(value,path,out=[]){
 if(value===null||value===undefined)return out;
 if(Array.isArray(value)){value.forEach((item,index)=>leaves(item,`${path}/${item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.id==='string'?'@'+item.id:index}`,out));return out;}
 if(typeof value==='object'){for(const [key,item] of Object.entries(value))if(key!=='id')leaves(item,`${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`,out);return out;}
 if(value==='')return out;out.push(path);return out;
}
/** User-provided claims for every populated leaf and one coverage assessment per registered field of the kind. */
function provenanceFor(kind,entryId,content,actor,fields=FIELDS){
 const base=rootOf(kind,entryId),targets=leaves(content,base);
 return {sources:[],evidence:[],claims:targets.length?[{id:randomUUID(),entry_id:entryId,targets,origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:actor,authored_at:'2026-10-17T00:00:00.000Z',note:'Entered by hand'}]:[],
  coverage:fields[kind].map(field=>({targets:[`${base}/${field}`],status:'not_checked',job_id:null,reason:'Entered manually'})),operations:[],conflicts:[],decisions:[]};
}
const entryIdFor=(kind,content)=>kind==='key_person'||kind==='offering'?content.id:randomUUID();
async function createEntry(user,company,kind,content,fields=FIELDS){
 const entry=entryIdFor(kind,content);
 return call(user,'public.create_entry',[company,kind,content,provenanceFor(kind,entry,content,owner,fields),randomUUID()]);
}
async function approve(user,company,rev){return call(user,'public.save_entry_revision',[company,rev.entry_id,rev.revision,rev.content,rev.provenance,'approved','Reviewed',randomUUID()]);}
async function newCompany(user,name='Acme'){return (await call(user,'public.create_company',[name,'https://acme.example',randomUUID()])).create_company;}
async function snapshotRows(user,company){
 return (await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[company])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
}
async function publish(user,company){const c=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0];return call(user,'public.publish_knowledge_base',[company,c.draft_generation,randomUUID()]);}
async function assembled(user,company,snapshot,authorId,name='Acme'){
 const {assembleKnowledgeBase}=await tsImport(resolve(root,'src/knowledge/assemble.ts'),import.meta.url);
 return assembleKnowledgeBase({company:{id:company,name,website:'https://acme.example'},snapshotId:snapshot.id,version:Number(snapshot.version_number),savedAt:snapshot.created_at.toISOString(),authorId,entries:await snapshotRows(user,company)});
}
/** Applies migration files like scripts/migrate.mjs does, for the files accepted by `include`. */
async function applyMigrations(href,include){
 const client=new pg.Client({connectionString:href});await client.connect();
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
const migrationNumber=file=>Number.parseInt(file.split('_')[0],10);

let url,admin,user;
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();
 url=await createDatabase();
 admin=await connect(url);await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const run=()=>spawnSync(process.execPath,[migrateScript],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});
 const initial=run();assert.equal(initial.status,0,initial.stderr);
 const files=(await readdir(migrationsDirectory)).filter(x=>x.endsWith('.sql'));
 assert.equal(initial.stdout.match(/Applied /g)?.length,files.length,'every migration file must apply on a fresh database');
 const replay=run();assert.equal(replay.status,0,replay.stderr);assert.equal(replay.stdout,'','replaying migrations must be a no-op');
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
 user=await connect(url,'authenticated',owner);
});
after(async()=>{for(const c of sessions)await c.end().catch(()=>{});if(administrator){for(const name of databases)await administrator.query(`DROP DATABASE IF EXISTS "${name}"`);await administrator.end();}});

test('C5: a new migration makes the SQL contract know the new fields, defaults and registry',async t=>{
 await t.test("the Q5 migration is new (0018, or 0019 when Q6's 0018_knowledge_assets_storage.sql is present), is recorded as applied; 0001-0017 are untouched",async()=>{
  const files=(await readdir(migrationsDirectory)).filter(x=>x.endsWith('.sql')).sort();
  const q6='0018_knowledge_assets_storage.sql';
  // Later Quests add their own migrations (0020 archives entries); only the two numbers this Quest could take count here.
  const added=files.filter(file=>migrationNumber(file)>=18&&migrationNumber(file)<=19&&file!==q6);
  assert.equal(added.length,1,'exactly one Q5 migration numbered above the migrations that came before it');
  const expected=files.includes(q6)?'0019_':'0018_';assert.ok(added[0].startsWith(expected),`Q5's migration is the first free number ${expected.slice(0,4)} (found ${added[0]})`);
  const {rows}=await admin.query("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version");
  assert.ok(rows.map(r=>r.version).includes(expected.slice(0,4)),`${expected.slice(0,4)} is applied`);
  assert.equal(rows.length,files.length,'every migration file is recorded as applied');
 });
 await t.test('private.contract_schema knows revenue, phone, age, nationality, portrait and images (and they are in the export schema)',async()=>{
  const schema=async kind=>(await admin.query('SELECT private.contract_schema($1) AS v',[kind])).rows[0].v;
  assert.ok((await schema('company_foundation')).properties.revenue,'company_foundation.revenue');
  assert.ok((await schema('online_presence')).properties.phone,'online_presence.phone');
  const keyPerson=(await schema('key_person')).properties;for(const key of ['age','nationality','portrait'])assert.ok(keyPerson[key],`key_person.${key}`);
  const images=(await schema('offering')).properties.images;assert.ok(images,'offering.images');assert.equal(images.type,'array');assert.equal(images.maxItems,20);
  const exported=(await schema('export')).properties;
  assert.ok(exported.company_foundation.properties.revenue&&exported.online_presence.properties.phone&&exported.key_people.items.properties.portrait&&exported.offerings.items.properties.images,'the export schema embeds the new fields');
  assert.equal(exported.provenance.properties.coverage.maxItems,4033,'export coverage cap');
  assert.equal((await admin.query("SELECT private.contract_schema('not_a_kind') AS v")).rows[0].v,null);
 });
 await t.test('private.business_defaults() has the new defaults and equals defaults.json',async()=>{
  const defaults=(await admin.query('SELECT private.business_defaults() AS v')).rows[0].v;
  assert.equal(defaults.company_foundation.revenue,null);assert.equal(defaults.online_presence.phone,null);
  assert.deepEqual(defaults,JSON.parse(await readFile(resolve(root,'src/contracts/defaults.json'),'utf8')),'SQL defaults must equal defaults.json');
 });
 await t.test('private.field_registry() lists the six new fields with their defaults, 48 fields in all',async()=>{
  const registry=(await admin.query('SELECT private.field_registry() AS v')).rows[0].v;
  assert.equal(registry.length,48);
  for(const [path,kind,field,fallback] of [['/company_foundation/revenue','company_foundation','revenue',null],['/online_presence/phone','online_presence','phone',null],['/key_people/@id/age','key_person','age',null],['/key_people/@id/nationality','key_person','nationality',null],['/key_people/@id/portrait','key_person','portrait',null],['/offerings/@id/images','offering','images',[]]]){
   const found=registry.filter(f=>f.path===path);assert.equal(found.length,1,`${path} registered once`);assert.equal(found[0].kind,kind);assert.equal(found[0].field,field);assert.deepEqual(found[0].default,fallback);assert.ok(found[0].allowedOrigins.includes('user_provided'),`${path} allows user_provided`);
  }
  assert.deepEqual(registry,JSON.parse(await readFile(resolve(root,'src/contracts/field-registry.json'),'utf8')),'SQL registry must equal field-registry.json');
 });
 await t.test('generate-sql-contract --check passes against the migrations',()=>{
  const generated=spawnSync(process.execPath,[generateScript,'--check',root],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 });
});

test('C5/C6: entries with the new fields save, approve, edit, publish and freeze through the protected functions',async t=>{
 const company=await newCompany(user);
 const personId=randomUUID(),offeringId=randomUUID();
 const portrait=ref(company,'portraits',{size_bytes:48213},uuid(1,'d2000000'));
 const images=[ref(company,'offering-images',{path:`offering-images/${company}/${uuid(2,'d2000000')}.jpg`,content_type:'image/jpeg',size_bytes:1048576},uuid(2,'d2000000')),ref(company,'offering-images',{path:`offering-images/${company}/${uuid(3,'d2000000')}.webp`,content_type:'image/webp',size_bytes:5242880},uuid(3,'d2000000'))];
 const contents={company_foundation:foundation({revenue:'€2.3M (FY2025)'}),online_presence:onlinePresence({phone:'5550100199'}),key_person:person(personId,{age:42,nationality:'Canadian',portrait}),offering:offering(offeringId,{images})};
 const revisions={};let snapshot1;
 await t.test('create stores each entry with the new fields exactly as given (revision 1)',async()=>{
  for(const [kind,content] of Object.entries(contents)){
   const rev=await ok(createEntry(user,company,kind,content),`create ${kind}`);assert.equal(rev.revision,1,kind);assert.deepEqual(rev.content,content,`${kind} content is stored exactly`);revisions[kind]=rev;
  }
 });
 await t.test('approve every entry (new revision, content unchanged)',async()=>{
  for(const [kind,rev] of Object.entries(revisions)){const approved=await ok(approve(user,company,rev),`approve ${kind}`);assert.equal(approved.revision,2,kind);assert.equal(approved.review_status,'approved');assert.deepEqual(approved.content,contents[kind]);revisions[kind]=approved;}
 });
 await t.test('edit new fields (new revision) and the earlier revision stays immutable history',async()=>{
  const edited=person(personId,{age:43,nationality:'Irish',portrait});
  const rev=await ok(call(user,'public.save_entry_revision',[company,personId,2,edited,provenanceFor('key_person',personId,edited,owner),'approved','Birthday',randomUUID()]),'edit person');
  assert.equal(rev.revision,3);assert.deepEqual(rev.content,edited);contents.key_person=edited;revisions.key_person=rev;
  const history=(await user.query('SELECT id,revision,content FROM public.knowledge_entry_versions WHERE company_id=$1 AND entry_id=$2 ORDER BY revision',[company,personId])).rows;
  assert.deepEqual(history.map(h=>h.revision),[1,2,3]);assert.equal(history[0].content.age,42);assert.equal(history[2].content.age,43);
  await rejected(admin.query('UPDATE public.knowledge_entry_versions SET content=$1 WHERE id=$2',[person(personId),history[0].id]),'history must be immutable');
 });
 await t.test('publication freezes the new fields into the snapshot, matching the TypeScript assembler, with one coverage row per new target',async()=>{
  snapshot1=await ok(publish(user,company),'publish');const payload=snapshot1.payload;
  assert.equal(payload.company_foundation.revenue,'€2.3M (FY2025)');assert.equal(payload.online_presence.phone,'5550100199');
  assert.deepEqual(payload.key_people[0],contents.key_person);assert.deepEqual(payload.offerings[0].images,images,'images keep their order');
  const claimed=payload.provenance.claims.flatMap(c=>c.targets);
  for(const leaf of ['/company_foundation/revenue','/online_presence/phone',`/key_people/@${personId}/age`,`/key_people/@${personId}/portrait/path`,`/offerings/@${offeringId}/images/@${images[0].id}/content_type`,`/offerings/@${offeringId}/images/@${images[1].id}/size_bytes`])assert.ok(claimed.includes(leaf),`claim for ${leaf}`);
  for(const target of ['/company_foundation/revenue','/online_presence/phone',`/key_people/@${personId}/age`,`/key_people/@${personId}/nationality`,`/key_people/@${personId}/portrait`,`/offerings/@${offeringId}/images`])assert.equal(payload.provenance.coverage.filter(c=>c.targets.includes(target)).length,1,`coverage for ${target}`);
  assert.deepEqual(payload,await assembled(user,company,snapshot1,owner));
 });
 await t.test('an earlier snapshot is unchanged by later revisions of the new fields',async()=>{
  const edited=person(personId,{age:44,nationality:'Irish',portrait:null});
  const rev=await ok(call(user,'public.save_entry_revision',[company,personId,3,edited,provenanceFor('key_person',personId,edited,owner),'approved','Portrait removed',randomUUID()]),'remove portrait');assert.equal(rev.revision,4);
  const snapshot2=await ok(publish(user,company),'publish again');assert.equal(snapshot2.payload.key_people[0].age,44);assert.equal(snapshot2.payload.key_people[0].portrait,null);
  const stored=(await user.query('SELECT payload,payload_sha256 FROM public.knowledge_base_versions WHERE id=$1',[snapshot1.id])).rows[0];assert.equal(stored.payload.key_people[0].age,43);assert.deepEqual(stored.payload.key_people[0].portrait,portrait);assert.equal(stored.payload_sha256,snapshot1.payload_sha256);
 });
});

test('C1/C3/C4: entries that leave every new field empty save, approve and publish with the defaults',async()=>{
 const company=await newCompany(user,'Empty');
 const personId=randomUUID(),offeringId=randomUUID();
 for(const [kind,content] of [['company_foundation',foundation({overview:'We build software.'})],['online_presence',onlinePresence()],['key_person',person(personId)],['offering',offering(offeringId)]]){
  const rev=await ok(createEntry(user,company,kind,content),`create ${kind}`);assert.deepEqual(rev.content,content);await ok(approve(user,company,rev),`approve ${kind}`);
 }
 const snapshot=await ok(publish(user,company),'publish');const payload=snapshot.payload;
 assert.equal(payload.company_foundation.revenue,null);assert.equal(payload.online_presence.phone,null);
 assert.deepEqual(payload.key_people[0],person(personId));assert.deepEqual(payload.offerings[0].images,[]);
 for(const target of ['/company_foundation/revenue','/online_presence/phone',`/key_people/@${personId}/age`,`/key_people/@${personId}/nationality`,`/key_people/@${personId}/portrait`,`/offerings/@${offeringId}/images`])assert.equal(payload.provenance.coverage.filter(c=>c.targets.includes(target)).length,1,target);
 assert.deepEqual(payload,await assembled(user,company,snapshot,owner,'Empty'));
});

/** Every rule of C1-C4 as the database must apply it. Each group creates its valid control first, in a fresh company. */
function pathVariants(folder,company,other){
 const U=uuid(9,'d3000000'),ok=(prefix=folder,co=company,name=`${U}.png`)=>`${prefix}/${co}/${name}`;
 return {
  'traversal (..)':[`${folder}/${company}/../${U}.png`,`../${ok()}`,`${folder}/../${company}/${U}.png`,`${ok()}/..`,`${folder}/${company}/%2e%2e/${U}.png`],
  'absolute and URL-like':[`/${ok()}`,`//${ok()}`,`C:/${ok()}`,`C:\\${folder}\\${company}\\${U}.png`,`file:///${ok()}`,`https://cdn.example/${ok()}`,`data:image/png;base64,iVBORw0KGgo=`,`${folder}\\${company}\\${U}.png`],
  'extra or missing segments':[`${folder}/${company}/nested/${U}.png`,`${folder}/${company}//${U}.png`,`./${ok()}`,`${folder}/${U}.png`,`${company}/${U}.png`],
  'wrong prefix':[ok('avatars'),ok('uploads'),ok(`${folder}s`),ok(folder.toUpperCase()),ok('')],
  'company segment is not a uuid':[ok(folder,'acme'),ok(folder,company.slice(1)),ok(folder,company.replaceAll('-',''))],
  'another company (DECISION D4)':[ok(folder,other)],
  'object name or extension':[`${folder}/${company}/photo.png`,`${folder}/${company}/${U}`,`${folder}/${company}/${U}.exe`,`${folder}/${company}/${U}.html`,`${folder}/${company}/${U}.bmp`,`${folder}/${company}/${U}.PNG`,`${folder}/${company}/${U}.png `,`${folder}/${company}/${U}.png\n`,`${folder}/${company}/${U}.png?x=1`],
 };
}
test('C1-C4: the database rejects exactly what TypeScript rejects (create_entry), and accepts the valid controls',async t=>{
 const shared=await newCompany(user,'Shared'),other=await newCompany(user,'Another tenant');
 // Singleton kinds allow one entry per company, so each singleton attempt gets a fresh company (a duplicate would refuse for the wrong reason).
 const attempt=async(kind,build)=>{const company=kind==='key_person'||kind==='offering'?shared:await newCompany(user,`Case ${randomUUID().slice(0,8)}`);return createEntry(user,company,kind,build(company));};
 const accepts=async(label,kind,build,after)=>{const rev=await ok(attempt(kind,build),label);assert.equal(rev.revision,1,label);if(after)after(rev);};
 const refuses=(label,kind,build)=>refusedByContract(attempt(kind,build),label);

 await t.test('C1 revenue: free text and null accepted; blank and non-text refused',async()=>{
  for(const revenue of ['$1M ARR','€2.3M (FY2025)','  $5M  ',null])await accepts(`revenue ${revenue}`,'company_foundation',()=>foundation({revenue}),rev=>assert.equal(rev.content.revenue,revenue));
  for(const revenue of ['','   ','\t\n',5,0,true,['$1M'],{}])await refuses(`revenue ${JSON.stringify(revenue)}`,'company_foundation',()=>foundation({revenue}));
 });
 await t.test('C2 phone: exactly 10 digits stored as such; every other length, letters, non-ASCII digits refused',async()=>{
  for(const phone of ['5550100199','0000000000','0123456789',null])await accepts(`phone ${phone}`,'online_presence',()=>onlinePresence({phone}),rev=>assert.equal(rev.content.phone,phone));
  for(const phone of ['555010019','55501001999','1','55501001990000','15550100199','+15550100199','+1 555 010 0199','+1 (555) 010-0199','1-555-010-0199','555010019a','abcdefghij','555-010-FLOW','1-800-FLOWERS','(555) 010-0199 ext 5','NaN','Infinity','','   ','()-',5550100199,0,true,['5550100199'],{},'٥٥٥٠١٠٠١٩٩','５５５０１００１９９','⁵⁵⁵⁰¹⁰⁰¹⁹⁹'])
   await refuses(`phone ${JSON.stringify(phone)}`,'online_presence',()=>onlinePresence({phone}));
 });
 await t.test('C2 (DECISION D1): punctuated numbers are refused or stored as the 10 digits, never stored punctuated',async()=>{
  await accepts('control','online_presence',()=>onlinePresence({phone:'5550100199'}));
  for(const phone of ['(555) 010-0199','555-010-0199','555.010.0199','555 010 0199',' 5550100199','5550100199 ','5550100199\n']){
   const company=await newCompany(user,'Punctuated');let stored;
   try{stored=await createEntry(user,company,'online_presence',onlinePresence({phone}));}catch(error){assert.doesNotMatch(error.message,UNRELATED,`${JSON.stringify(phone)}: refused for an unrelated reason`);continue;}
   assert.equal(stored.content.phone,'5550100199',`${JSON.stringify(phone)} accepted => stored as the 10 digits`);
  }
 });
 await t.test('C3 age: integers 0-150 and null accepted; below, above, fractional, textual and non-number refused',async()=>{
  for(const age of [0,1,42,150,null])await accepts(`age ${age}`,'key_person',()=>person(randomUUID(),{age}),rev=>assert.equal(rev.content.age,age));
  for(const age of [-1,-0.5,151,152,1000,1e9,2.5,0.5,149.999,150.5,'42','042','4e1','NaN','Infinity','forty','',' ','0',true,false,[],[42],{}])await refuses(`age ${JSON.stringify(age)}`,'key_person',()=>person(randomUUID(),{age}));
 });
 await t.test('C3 nationality: text and null accepted; blank and non-text refused',async()=>{
  for(const nationality of ['Canadian','Côte d\'Ivoire',null])await accepts(`nationality ${nationality}`,'key_person',()=>person(randomUUID(),{nationality}),rev=>assert.equal(rev.content.nationality,nationality));
  for(const nationality of ['','   ','\t\n',5,true,['Canadian'],{}])await refuses(`nationality ${JSON.stringify(nationality)}`,'key_person',()=>person(randomUUID(),{nationality}));
 });
 for(const [label,kind,folder,put] of [['key_person.portrait','key_person','portraits',(value)=>person(randomUUID(),{portrait:value})],['offering.images[0]','offering','offering-images',(value)=>offering(randomUUID(),{images:[value]})]]){
  await t.test(`C4 storage reference at ${label}: valid references accepted, every malformed field refused`,async()=>{
   for(const [ext,type] of [['png','image/png'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['gif','image/gif'],['webp','image/webp'],['svg','image/svg+xml']])
    await accepts(`${ext}`,kind,company=>put(ref(company,folder,{path:`${folder}/${company}/${uuid(1,'d2000000')}.${ext}`,content_type:type})));
   await accepts('largest size',kind,company=>put(ref(company,folder,{size_bytes:5*1024*1024})));
   await accepts('smallest size',kind,company=>put(ref(company,folder,{size_bytes:1})));
   for(const [group,paths] of Object.entries(pathVariants(folder,shared,other)))
    for(const bad of paths)await refuses(`${label} path ${group}: ${bad}`,kind,company=>put(ref(company,folder,{path:bad})));
   for(const contentType of ['image/bmp','image/tiff','image/jpg','image/avif','text/html','application/pdf','IMAGE/PNG','image/png; charset=binary','',null,5])await refuses(`${label} content_type ${contentType}`,kind,company=>put(ref(company,folder,{content_type:contentType})));
   for(const [ext,type] of [['png','image/jpeg'],['jpg','image/png'],['jpeg','image/webp'],['gif','image/png'],['webp','image/gif'],['svg','image/png'],['png','image/svg+xml']])
    await refuses(`${label} mismatch ${ext} + ${type} (DECISION D3)`,kind,company=>put(ref(company,folder,{path:`${folder}/${company}/${uuid(1,'d2000000')}.${ext}`,content_type:type})));
   for(const size of [0,-1,0.5,1.5,5*1024*1024+1,10*1024*1024,'2048','',null,true,[2048]])await refuses(`${label} size ${JSON.stringify(size)}`,kind,company=>put(ref(company,folder,{size_bytes:size})));
   for(const id of ['','not-a-uuid',7,null])await refuses(`${label} id ${JSON.stringify(id)}`,kind,company=>put(ref(company,folder,{id})));
   for(const missing of ['id','path','content_type','size_bytes'])await refuses(`${label} without ${missing}`,kind,company=>{const value=ref(company,folder);delete value[missing];return put(value);});
   for(const extra of [{url:'https://cdn.example/x.png'},{alt:'A person'},{bucket:'private'}])await refuses(`${label} extra key ${Object.keys(extra)[0]}`,kind,company=>put({...ref(company,folder),...extra}));
   for(const bad of [{},'portraits/x.png',5,true,[],[{}]])await refuses(`${label} not a reference: ${JSON.stringify(bad)}`,kind,()=>put(bad));
  });
 }
 await t.test('C4 offering.images: empty, one and exactly 20 accepted in order; 21, duplicates, one bad item and non-arrays refused',async()=>{
  const list=(company,count,start=100)=>Array.from({length:count},(_,n)=>{const id=uuid(start+n,'d4000000');return {id,path:`offering-images/${company}/${id}.png`,content_type:'image/png',size_bytes:10+n};});
  for(const count of [0,1,20])await accepts(`${count} images`,'offering',company=>offering(randomUUID(),{images:list(company,count)}),rev=>assert.deepEqual(rev.content.images,list(rev.company_id,count)));
  for(const count of [21,25,50])await refuses(`${count} images`,'offering',company=>offering(randomUUID(),{images:list(company,count)}));
  await refuses('duplicate image ids','offering',company=>{const [a,b]=list(company,2);return offering(randomUUID(),{images:[a,{...b,id:a.id}]});});
  await refuses('one bad item among three','offering',company=>{const [a,b,c]=list(company,3);return offering(randomUUID(),{images:[a,b,{...c,size_bytes:0}]});});
  for(const images of [null,'images',3,{}])await refuses(`images ${JSON.stringify(images)}`,'offering',()=>offering(randomUUID(),{images}));
  await refuses('image id equal to the offering id','offering',company=>{const id=randomUUID();return offering(id,{images:[{...list(company,1)[0],id}]});});
 });
 await t.test('Edge case: unknown keys next to the new fields are refused',async()=>{
  await refuses('foundation turnover','company_foundation',()=>foundation({turnover:'$2M'}));
  await refuses('online fax','online_presence',()=>onlinePresence({fax:'5550100198'}));
  await refuses('person nickname','key_person',()=>person(randomUUID(),{nickname:'Al'}));
  await refuses('offering gallery','offering',()=>offering(randomUUID(),{gallery:[]}));
 });
 await t.test('Edge case: a person whose only fact is age 0 is storable (0 is a populated leaf that needs its claim)',async()=>{
  await accepts('age 0 only','key_person',()=>person(randomUUID(),{name:null,age:0}),rev=>assert.equal(rev.content.age,0));
 });
 await t.test('Edge case: a populated new leaf without a claim is refused (provenance covers the new fields)',async()=>{
  const company=await newCompany(user,'Unclaimed');const id=randomUUID();const content=person(id,{age:42});
  const provenance=provenanceFor('key_person',id,content,owner);provenance.claims=[{...provenance.claims[0],targets:provenance.claims[0].targets.filter(t=>!t.endsWith('/age'))}];
  const error=await rejected(call(user,'public.create_entry',[company,'key_person',content,provenance,randomUUID()]),'age without a claim');assert.match(error.message,/unclaimed_leaf/);
  const portraitContent=person(id,{portrait:ref(company,'portraits')});const p2=provenanceFor('key_person',id,portraitContent,owner);p2.claims=[{...p2.claims[0],targets:p2.claims[0].targets.filter(t=>!t.endsWith('/portrait/size_bytes'))}];
  assert.match((await rejected(call(user,'public.create_entry',[company,'key_person',portraitContent,p2,randomUUID()]),'portrait size without a claim')).message,/unclaimed_leaf/);
 });
 await t.test('Edge case: coverage for every new field is required in an entry (an entry missing the new coverage rows is refused)',async()=>{
  const company=await newCompany(user,'Coverage');const id=randomUUID();const content=person(id,{age:42});
  for(const field of ['age','nationality','portrait']){
   const provenance=provenanceFor('key_person',id,content,owner);provenance.coverage=provenance.coverage.filter(c=>!c.targets[0].endsWith(`/${field}`));
   assert.match((await rejected(call(user,'public.create_entry',[company,'key_person',content,provenance,randomUUID()]),`no coverage for ${field}`)).message,new RegExp(`coverage_required:.*${field}`));
  }
  const offeringId=randomUUID(),shop=offering(offeringId);const provenance=provenanceFor('offering',offeringId,shop,owner);provenance.coverage=provenance.coverage.filter(c=>!c.targets[0].endsWith('/images'));
  assert.match((await rejected(call(user,'public.create_entry',[company,'offering',shop,provenance,randomUUID()]),'no coverage for images')).message,/coverage_required:.*images/);
  const foundationProvenance=provenanceFor('company_foundation',randomUUID(),foundation(),owner);foundationProvenance.coverage=foundationProvenance.coverage.filter(c=>!c.targets[0].endsWith('/revenue'));
  assert.match((await rejected(call(user,'public.create_entry',[company,'company_foundation',foundation(),foundationProvenance,randomUUID()]),'no coverage for revenue')).message,/coverage_required:.*revenue/);
  const onlineProvenance=provenanceFor('online_presence',randomUUID(),onlinePresence(),owner);onlineProvenance.coverage=onlineProvenance.coverage.filter(c=>!c.targets[0].endsWith('/phone'));
  assert.match((await rejected(call(user,'public.create_entry',[company,'online_presence',onlinePresence(),onlineProvenance,randomUUID()]),'no coverage for phone')).message,/coverage_required:.*phone/);
 });
});

test('C1-C4: the database rejects invalid new values on update (save_entry_revision), keeps the revision, and accepts the valid control',async t=>{
 const company=await newCompany(user,'Updates'),otherCompany=await newCompany(user,'Elsewhere');
 const personId=randomUUID(),offeringId=randomUUID();
 const created={};
 for(const [kind,content] of [['company_foundation',foundation({revenue:'$1M ARR'})],['online_presence',onlinePresence({phone:'5550100199'})],['key_person',person(personId,{age:42,nationality:'Canadian',portrait:ref(company,'portraits')})],['offering',offering(offeringId,{images:[ref(company,'offering-images',{},uuid(2,'d2000000'))]})]])created[kind]={rev:await ok(createEntry(user,company,kind,content),`create ${kind}`),content};
 const save=(kind,content,expected=created[kind].rev.revision)=>call(user,'public.save_entry_revision',[company,created[kind].rev.entry_id,expected,content,provenanceFor(kind,created[kind].rev.entry_id,content,owner),'unreviewed','Edit',randomUUID()]);
 const currentRevision=async kind=>(await user.query('SELECT current_revision FROM public.knowledge_entries WHERE company_id=$1 AND id=$2',[company,created[kind].rev.entry_id])).rows[0].current_revision;
 const cases=[
  ['foundation','company_foundation',{...created.company_foundation.content,revenue:'  '}],
  ['foundation','company_foundation',{...created.company_foundation.content,revenue:5}],
  ['online','online_presence',{...created.online_presence.content,phone:'555010019'}],
  ['online','online_presence',{...created.online_presence.content,phone:'15550100199'}],
  ['online','online_presence',{...created.online_presence.content,phone:'555-010-FLOW'}],
  ['person','key_person',{...created.key_person.content,age:151}],
  ['person','key_person',{...created.key_person.content,age:-1}],
  ['person','key_person',{...created.key_person.content,age:2.5}],
  ['person','key_person',{...created.key_person.content,age:'42'}],
  ['person','key_person',{...created.key_person.content,nationality:' '}],
  ['person','key_person',{...created.key_person.content,portrait:ref(company,'portraits',{path:`portraits/${company}/../${uuid(1,'d2000000')}.png`})}],
  ['person','key_person',{...created.key_person.content,portrait:ref(company,'portraits',{path:`portraits/${otherCompany}/${uuid(1,'d2000000')}.png`})}],
  ['person','key_person',{...created.key_person.content,portrait:ref(company,'portraits',{content_type:'image/jpeg'})}],
  ['person','key_person',{...created.key_person.content,portrait:ref(company,'portraits',{size_bytes:5*1024*1024+1})}],
  ['offering','offering',{...created.offering.content,images:Array.from({length:21},(_,n)=>({id:uuid(200+n,'d4000000'),path:`offering-images/${company}/${uuid(200+n,'d4000000')}.png`,content_type:'image/png',size_bytes:10}))}],
  ['offering','offering',{...created.offering.content,images:[created.offering.content.images[0],{...created.offering.content.images[0]}]}],
  ['offering','offering',{...created.offering.content,images:[ref(company,'offering-images',{path:`offering-images/${otherCompany}/${uuid(2,'d2000000')}.png`},uuid(2,'d2000000'))]}],
 ];
 for(const [group,kind,bad] of cases)await t.test(`refuses ${group}: ${JSON.stringify(bad).slice(0,110)}`,async()=>{
  const before=await currentRevision(kind);await refusedByContract(save(kind,bad),`${group} update`);assert.equal(await currentRevision(kind),before,'a refused update must not create a revision');
 });
 await t.test('the valid controls are accepted as new revisions',async()=>{
  const good={company_foundation:{...created.company_foundation.content,revenue:'€2.3M'},online_presence:{...created.online_presence.content,phone:'2125550123'},key_person:{...created.key_person.content,age:150,nationality:'Irish'},offering:{...created.offering.content,images:[...created.offering.content.images,ref(company,'offering-images',{path:`offering-images/${company}/${uuid(5,'d2000000')}.gif`,content_type:'image/gif'},uuid(5,'d2000000'))]}};
  for(const [kind,content] of Object.entries(good)){const saved=await ok(save(kind,content),`save ${kind}`);assert.equal(saved.revision,created[kind].rev.revision+1,kind);assert.deepEqual(saved.content,content);}
 });
});

test('C4/C1-C3: invalid values are refused on every write path, including a direct insert of a revision (deferred check at commit)',async t=>{
 const company=await newCompany(user,'Direct'),elsewhere=await newCompany(user,'Elsewhere');const personId=randomUUID();
 const rev=await ok(createEntry(user,company,'key_person',person(personId,{age:30})),'create person');
 const insert=async content=>{
  await admin.query('BEGIN');
  try{
   await admin.query('INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES($1,$2,2,$3,$4,$5)',[company,personId,JSON.stringify(content),JSON.stringify(provenanceFor('key_person',personId,content,owner)),owner]);
   await admin.query('UPDATE public.knowledge_entries SET current_revision=2 WHERE company_id=$1 AND id=$2',[company,personId]);
   await admin.query('COMMIT');
  }catch(error){await admin.query('ROLLBACK');throw error;}
 };
 await t.test('age 151 inserted directly is refused',async()=>{await rejected(insert(person(personId,{age:151})),'direct insert of age 151');assert.equal((await admin.query('SELECT current_revision FROM public.knowledge_entries WHERE id=$1',[personId])).rows[0].current_revision,1);});
 await t.test('a portrait of another company inserted directly is refused',async()=>{await rejected(insert(person(personId,{portrait:ref(elsewhere,'portraits')})),'direct insert of a foreign portrait');});
 await t.test('the valid control is accepted',async()=>{await ok(insert(person(personId,{age:31})),'direct insert of a valid revision');assert.equal((await admin.query('SELECT current_revision FROM public.knowledge_entries WHERE id=$1',[personId])).rows[0].current_revision,2);assert.equal(rev.revision,1);});
});

test('C7: data saved before 0018 survives the migration (snapshots are byte-identical; entries without the new keys still publish)',async t=>{
 const oldUrl=await createDatabase();
 const oldAdmin=await connect(oldUrl);await oldAdmin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 await applyMigrations(oldUrl,file=>migrationNumber(file)<=17);
 await oldAdmin.query('RESET ROLE');await oldAdmin.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
 const oldUser=await connect(oldUrl,'authenticated',owner);
 const company=await newCompany(oldUser,'Legacy');const personId=randomUUID(),offeringId=randomUUID();
 const contents={company_foundation:oldFoundation(),online_presence:{social_media_links:[]},key_person:oldPerson(personId),offering:oldOffering(offeringId)};
 contents.company_foundation.overview='We build inventory software.';
 for(const [kind,content] of Object.entries(contents)){const rev=await createEntry(oldUser,company,kind,content,OLD_FIELDS);await approve(oldUser,company,rev);}
 const before=await publish(oldUser,company);
 assert.equal(before.payload.provenance.coverage.length,29+1+5+7,'(sanity) the pre-0018 snapshot has the old rows: 29 singleton fields + site_links + 5 per person + 7 per offering');
 assert.ok(!('revenue' in before.payload.company_foundation),'a pre-0018 snapshot has no revenue');
 const storedBefore=(await oldAdmin.query('SELECT payload,payload_sha256,entry_manifest FROM public.knowledge_base_versions WHERE id=$1',[before.id])).rows[0];
 const legacyRows=await snapshotRows(oldUser,company);
 await applyMigrations(oldUrl,file=>migrationNumber(file)>=18);
 const replay=spawnSync(process.execPath,[migrateScript],{env:{...process.env,DATABASE_URL:oldUrl},encoding:'utf8'});assert.equal(replay.status,0,replay.stderr);assert.equal(replay.stdout,'','a staged upgrade equals a one-step migration: nothing left to apply');
 await t.test('the snapshot published before 0018 is byte-identical after it (payload, hash, manifest) and its hash still verifies',async()=>{
  const after=(await oldAdmin.query('SELECT payload,payload_sha256,entry_manifest FROM public.knowledge_base_versions WHERE id=$1',[before.id])).rows[0];
  assert.deepEqual(after.payload,storedBefore.payload);assert.equal(after.payload_sha256,storedBefore.payload_sha256);assert.deepEqual(after.entry_manifest,storedBefore.entry_manifest);
  const digest=(await oldAdmin.query("SELECT encode(public.digest(convert_to(private.canonical_json($1::jsonb),'UTF8'),'sha256'),'hex') AS h",[JSON.stringify(storedBefore.payload)])).rows[0].h;assert.equal(digest,storedBefore.payload_sha256);
  assert.ok(!('revenue' in after.payload.company_foundation)&&!('age' in after.payload.key_people[0])&&!('images' in after.payload.offerings[0]),'old snapshots are not rewritten with the new fields');
  await rejected(oldAdmin.query("UPDATE public.knowledge_base_versions SET payload=payload||'{}'::jsonb WHERE id=$1",[before.id]),'snapshots stay immutable');
 });
 await t.test('entry revisions saved before 0018 are unchanged history',async()=>{
  const rows=await snapshotRows(oldUser,company);assert.deepEqual(rows.map(r=>r.content),legacyRows.map(r=>r.content));
  for(const row of rows)assert.equal(row.revision,2);
 });
 await t.test('(beyond the literal criteria, see report) entries without the new keys still publish: defaults are filled in and the new targets are not-checked',async()=>{
  const generation=(await oldUser.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation;
  const snapshot=await ok(call(oldUser,'public.publish_knowledge_base',[company,generation,randomUUID()]),'publish legacy entries');
  const payload=snapshot.payload;
  assert.equal(payload.company_foundation.revenue,null);assert.equal(payload.online_presence.phone,null);
  assert.deepEqual(payload.key_people[0],person(personId));assert.deepEqual(payload.offerings[0].images,[]);
  for(const target of ['/company_foundation/revenue','/online_presence/phone',`/key_people/@${personId}/age`,`/key_people/@${personId}/nationality`,`/key_people/@${personId}/portrait`,`/offerings/@${offeringId}/images`]){
   const rows=payload.provenance.coverage.filter(c=>c.targets.includes(target));assert.equal(rows.length,1,target);assert.equal(rows[0].status,'not_checked');assert.equal(rows[0].reason,'No approved entry assessed this field.');
  }
  assert.deepEqual(payload,await assembled(oldUser,company,snapshot,owner,'Legacy'));
  const unchanged=(await oldAdmin.query('SELECT payload_sha256 FROM public.knowledge_base_versions WHERE id=$1',[before.id])).rows[0].payload_sha256;assert.equal(unchanged,storedBefore.payload_sha256);
 });
 await t.test('an entry saved before 0018 can be edited to use the new fields',async()=>{
  const edited=person(personId,{age:41,nationality:'Canadian'});
  const saved=await ok(call(oldUser,'public.save_entry_revision',[company,personId,2,edited,provenanceFor('key_person',personId,edited,owner),'approved','Added age and nationality',randomUUID()]),'edit legacy person');
  assert.equal(saved.revision,3);assert.deepEqual(saved.content,edited);
 });
});
