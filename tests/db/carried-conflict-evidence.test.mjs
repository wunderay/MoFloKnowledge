// A conflict carried over with non-person-authored candidates keeps the evidence rows it had; the
// excerpt behind a candidate's evidence id cannot be swapped while the conflict is carried.
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/carried-conflict-evidence.test.mjs
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
let administrator,admin;const sessions=[];
const owner=randomUUID();
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));return q.rows[0];}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

test('the evidence rows behind a carried conflict candidate cannot be swapped',async()=>{
 const user=await connect('authenticated',owner);const worker=await connect('moflo_worker');
 const company=(await call(user,'public.create_company',['Acme','https://acme.example',randomUUID()])).create_company;
 const job=await call(user,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
 const claimed=(await worker.query("SELECT private.claim_job('carried-conflict') AS job")).rows[0].job;assert.equal(claimed.id,job.id);
 const first='Acme roasts coffee.',second='Acme sells coffee to cafes.';const text=`${first} ${second}`;
 const source=await call(worker,'private.insert_source_capture',[claimed.id,company,claimed.lease_token,{normalized_url:'https://acme.example/',final_url:'https://acme.example/',title:'Acme',author:null,site_name:'Acme',published_on:null,retrieved_at:'2026-10-16T00:00:00.000Z',response_status:200,capture_status:'captured',capture_method:'http',cleaned_content:text,content_sha256:createHash('sha256').update(text).digest('hex'),observations:{segments:[{id:'segment-1',text}]},design_evidence:{observations:[]},error_code:null}]);
 const sourceRow={id:source.id,url:source.final_url,title:source.title,author:null,site_name:source.site_name,published_on:null,retrieved_at:source.retrieved_at.toISOString()};
 const defaults=(await admin.query('SELECT private.business_defaults() AS v')).rows[0].v;
 const registry=(await admin.query('SELECT private.field_registry() AS v')).rows[0].v;
 const coverage=kind=>registry.filter(f=>f.kind===kind).map(f=>({targets:[f.path],status:'not_checked',job_id:null,reason:'Fixture'}));
 const progress={stage:'crawling',discovered:1,selected:1,captured:1,failed:0,blocked:0,extracted:0,document_limit:10,limits_reached:[]};
 await call(worker,'private.checkpoint_job',[claimed.id,company,claimed.lease_token,{},progress]);
 await call(worker,'private.checkpoint_job',[claimed.id,company,claimed.lease_token,{},{...progress,stage:'extracting',extracted:1}]);
 const target='/company_foundation/overview';const entry=randomUUID();
 const evA={id:randomUUID(),source_page_id:source.id,kind:'text',excerpt:first,technical:null},evB={id:randomUUID(),source_page_id:source.id,kind:'text',excerpt:second,technical:null};
 const conflict={id:randomUUID(),target,material:false,candidates:[{id:randomUUID(),value:first,origin:'source_backed',evidence_ids:[evA.id],based_on_claim_ids:[]},{id:randomUUID(),value:second,origin:'source_backed',evidence_ids:[evB.id],based_on_claim_ids:[]}]};
 const claim={id:randomUUID(),entry_id:entry,targets:[target],origin:'source_backed',evidence_ids:[evA.id],based_on_claim_ids:[],actor_id:null,authored_at:null,note:'From the website'};
 const candidate=(kind,content,p,conflicts=[])=>({id:randomUUID(),kind,target_entry_id:null,base_revision:null,schema_version:'1.0.0',content,provenance:p,conflicts});
 const empty=kind=>({sources:[],evidence:[],claims:[],coverage:coverage(kind),operations:[],conflicts:[],decisions:[]});
 const candidates=[candidate('company_foundation',{...defaults.company_foundation,overview:first},{sources:[sourceRow],evidence:[evA,evB],claims:[claim],coverage:coverage('company_foundation'),operations:[],conflicts:[],decisions:[]},[conflict]),...['positioning','market_and_customers','branding_and_style','online_presence'].map(kind=>candidate(kind,defaults[kind],empty(kind)))];
 await call(worker,'private.finish_job',[claimed.id,company,claimed.lease_token,{candidates,decisions:[]},[{targets:[target],status:'partial',job_id:claimed.id,reason:'Fixture'}]]);
 const stored=(await user.query('SELECT * FROM public.knowledge_entry_versions WHERE company_id=$1 AND revision=1 AND content->>$2=$3',[company,'overview',first])).rows[0];
 assert.ok(stored&&stored.provenance.conflicts.length===1,'fixture: the import stored the conflict');
 const save=provenance=>call(user,'public.save_entry_revision',[company,stored.entry_id,1,stored.content,provenance,'unreviewed','Carry',randomUUID()]);
 const swapped=structuredClone(stored.provenance);swapped.evidence=swapped.evidence.map(e=>e.id===evB.id?{...e,excerpt:'sells coffee'}:e);
 await assert.rejects(save(swapped),error=>error.code==='23514'&&/unsupported_candidate_origin/.test(error.message));
 assert.equal((await save(stored.provenance)).revision,2);
});
