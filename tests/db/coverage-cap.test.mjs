// A mix that was exactly full under the original cap (190 people, 3 offerings) still publishes, now with 8 rows per entry and
// 32 singleton rows (1,576). The export contract's cap is 4,033 rows (see model-fields-coverage-cap.test.mjs for the
// derivation and the 500-entry maximum): a payload of exactly 4,033 rows validates and one more is refused.
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
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));return q.rows[0];}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 assert.ok((await readdir(new URL('../../supabase/migrations/',import.meta.url))).length>0);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

function entry(kind,fields){
 const id=randomUUID(),section=kind==='key_person'?'key_people':'offerings';
 const content=kind==='key_person'?{id,name:'Person '+id.slice(0,8),title:null,role:null,gender:null,background_or_relevance:null,age:null,nationality:null,portrait:null}:{id,name:'Offering '+id.slice(0,8),description:null,offering_type:null,category:null,features:[],pricing:null,url:null,images:[]};
 const provenance={sources:[],evidence:[],claims:[{id:randomUUID(),entry_id:id,targets:[`/${section}/@${id}/name`],origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:owner,authored_at:'2026-10-16T00:00:00.000Z',note:'Entered by hand'}],
  coverage:fields.map(field=>({targets:[`/${section}/@${id}/${field}`],status:'not_checked',job_id:null,reason:'Entered manually'})),operations:[],conflicts:[],decisions:[]};
 return {id,kind,content,provenance};
}
test('a snapshot of the old maximum mix publishes (1,576 rows); the SQL contract accepts 4,033 rows and refuses one more',async()=>{
 const user=await connect('authenticated',owner);
 const company=(await call(user,'public.create_company',['Full','https://full.example',randomUUID()])).create_company;
 const people=Array.from({length:190},()=>entry('key_person',['name','title','role','gender','background_or_relevance','age','nationality','portrait']));
 const offerings=Array.from({length:3},()=>entry('offering',['name','description','offering_type','category','features','pricing','url','images']));
 for(const item of [...people,...offerings]){
  const created=await call(user,'public.create_entry',[company,item.kind,item.content,item.provenance,randomUUID()]);
  await call(user,'public.save_entry_revision',[company,created.entry_id,1,item.content,created.provenance,'approved','Reviewed',randomUUID()]);
 }
 const generation=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation;
 const snapshot=await call(user,'public.publish_knowledge_base',[company,generation,randomUUID()]);
 assert.equal(snapshot.payload.provenance.coverage.length,1576,'32 singleton fields + 190 x 8 + 3 x 8');
 const {KnowledgeBaseExportSchema}=await tsImport(resolve(root,'src/contracts/index.ts'),import.meta.url);
 assert.equal(KnowledgeBaseExportSchema.safeParse(snapshot.payload).success,true,'the TypeScript export schema accepts the same payload');
 const check=payload=>admin.query("SELECT private.validate_json($1::jsonb,private.contract_schema('export'))",[JSON.stringify(payload)]);
 await check(snapshot.payload);
 const full=structuredClone(snapshot.payload);while(full.provenance.coverage.length<4033)full.provenance.coverage.push(full.provenance.coverage[0]);
 await check(full);assert.equal(KnowledgeBaseExportSchema.safeParse(full).success,true,'4,033 rows');
 const over=structuredClone(full);over.provenance.coverage.push(over.provenance.coverage[0]);
 await assert.rejects(check(over),/array_limit/);
 assert.equal(KnowledgeBaseExportSchema.safeParse(over).success,false);
});
