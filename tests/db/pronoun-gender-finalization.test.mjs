// Finishing a crawl whose key_person proposal carries a gender taken from the person's own bio pronouns.
// The pronoun claim is accepted only when a cited excerpt names the person and uses third-person pronouns of the
// selected gender only; every other pronoun claim is refused with gender_self_description_required, and a quoted
// self-description still works.
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/pronoun-gender-finalization.test.mjs
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const supplied=process.env.TEST_DATABASE_URL;
if(!supplied)throw new Error('NOT_RUN: TEST_DATABASE_URL is required and must point to a disposable *_test database');
if(!new URL(supplied).pathname.endsWith('_test'))throw new Error('Test database name must end _test');
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
let administrator,admin,owner,worker,registry,defaults;const sessions=[];
const ownerId=randomUUID();
const at='2026-10-16T00:00:00.000Z';
const PRONOUN_NOTE="Third-person pronouns in the person's own bio.";
async function connect(role,subject){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(subject)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[subject]);return c;}
const encode=x=>x!==null&&typeof x==='object'?JSON.stringify(x):x;
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(encode));return q.rows[0];}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1)',[ownerId]);
 owner=await connect('authenticated',ownerId);worker=await connect('moflo_worker');
 defaults=(await admin.query('SELECT private.business_defaults() AS v')).rows[0].v;
 registry=(await admin.query('SELECT private.field_registry() AS v')).rows[0].v;
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

const NAMING='Jane Doe helps families plan for retirement.';
const REST='She leads client strategy and mentors new advisers.';
const coverageOf=(kind,id,job)=>registry.filter(f=>f.kind===kind).map(f=>f.path.replace('@id','@'+id)).map(t=>({targets:[t],status:'partial',job_id:job,reason:'Fixture coverage'}));
const sourced=(entry,targets,evidence,note)=>({id:randomUUID(),entry_id:entry,targets,origin:'source_backed',evidence_ids:evidence.map(e=>e.id),based_on_claim_ids:[],actor_id:null,authored_at:null,note});
/** A company with one crawl that captured `text` as a single segment; returns the claimed job and the stored page. */
async function crawl(text){
 const company=(await call(owner,'public.create_company',['Pronoun '+randomUUID().slice(0,8),'https://acme.example',randomUUID()])).create_company;
 const job=await call(owner,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
 const claimed=(await worker.query("SELECT private.claim_job('pronoun-gender') AS job")).rows[0].job;assert.equal(claimed.id,job.id);
 const page=await call(worker,'private.insert_source_capture',[claimed.id,company,claimed.lease_token,{normalized_url:'https://acme.example/jane-doe',final_url:'https://acme.example/jane-doe',title:'Jane Doe',author:null,site_name:'Acme',published_on:null,retrieved_at:at,response_status:200,capture_status:'captured',capture_method:'http',cleaned_content:text,content_sha256:createHash('sha256').update(text).digest('hex'),observations:{segments:[{id:'segment-0',text}]},design_evidence:{observations:[]},error_code:null}]);
 const progress={stage:'crawling',discovered:1,selected:1,captured:1,failed:0,blocked:0,extracted:0,document_limit:10,limits_reached:[]};
 await call(worker,'private.checkpoint_job',[claimed.id,company,claimed.lease_token,{},progress]);
 await call(worker,'private.checkpoint_job',[claimed.id,company,claimed.lease_token,{},{...progress,stage:'extracting',extracted:1}]);
 return {company,job:claimed,page};
}
/** Finishes the crawl with one key_person proposal: Jane Doe, gender Female, claimed with `genderNote` from `genderExcerpt`. */
async function finish({text,genderExcerpt,genderNote}){
 const {company,job,page}=await crawl(text);
 const entry=randomUUID();
 const source={id:page.id,url:page.final_url,title:page.title,author:null,site_name:page.site_name,published_on:null,retrieved_at:page.retrieved_at.toISOString()};
 const nameEvidence={id:randomUUID(),source_page_id:page.id,kind:'text',excerpt:'Jane Doe',technical:null};
 const genderEvidence={id:randomUUID(),source_page_id:page.id,kind:'text',excerpt:genderExcerpt,technical:null};
 const root=`/key_people/@${entry}`;
 const provenance={sources:[source],evidence:[nameEvidence,genderEvidence],
  claims:[sourced(entry,[`${root}/name`],[nameEvidence],'From the website'),sourced(entry,[`${root}/gender`],[genderEvidence],genderNote)],
  coverage:coverageOf('key_person',entry,job.id),operations:[],conflicts:[],decisions:[]};
 const candidate={id:randomUUID(),kind:'key_person',target_entry_id:null,base_revision:null,schema_version:'1.0.0',content:{id:entry,name:'Jane Doe',title:null,role:null,gender:'Female',background_or_relevance:null,age:null,nationality:null,portrait:null},provenance,conflicts:[]};
 // A first import also initializes the five singleton entries, here left at their defaults.
 const singletons=['company_foundation','positioning','market_and_customers','branding_and_style','online_presence'].map(kind=>({id:randomUUID(),kind,target_entry_id:null,base_revision:null,schema_version:'1.0.0',content:defaults[kind],provenance:{sources:[],evidence:[],claims:[],coverage:coverageOf(kind,randomUUID(),job.id),operations:[],conflicts:[],decisions:[]},conflicts:[]}));
 return call(worker,'private.finish_job',[job.id,company,job.lease_token,{candidates:[...singletons,candidate],decisions:[]},[]]);
}

test('a pronoun-derived gender claim is accepted only when the cited excerpt names the person and uses her pronouns alone',async t=>{
 await t.test('the naming sentence plus the next sentence, with she/her only, finishes the job',async()=>{
  const text=`${NAMING} ${REST}`;
  const finished=await finish({text,genderExcerpt:text,genderNote:PRONOUN_NOTE});
  assert.equal(finished.proposals.candidates.length,6);
  assert.equal(finished.proposals.candidates.find(c=>c.kind==='key_person').content.gender,'Female');
 });
 await t.test('an excerpt that lacks the person\'s name is refused',async()=>{
  await assert.rejects(finish({text:`${NAMING} ${REST}`,genderExcerpt:REST,genderNote:PRONOUN_NOTE}),/gender_self_description_required/);
 });
 await t.test('an excerpt that mixes he and she pronouns is refused',async()=>{
  const text=`${NAMING} She leads client strategy and he mentors new advisers.`;
  await assert.rejects(finish({text,genderExcerpt:text,genderNote:PRONOUN_NOTE}),/gender_self_description_required/);
 });
});

test('a quoted self-description gender claim still finishes the job',async()=>{
 const text='Jane Doe, gender: Female, leads client strategy.';
 const finished=await finish({text,genderExcerpt:text,genderNote:'Self-description on the profile page.'});
 assert.equal(finished.proposals.candidates.find(c=>c.kind==='key_person').content.gender,'Female');
});
