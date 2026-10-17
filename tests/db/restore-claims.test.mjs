// Undo of a removed list item (Quest Q7 inline-edit-core): save_entry_revision lets a value through the edit-origin check
// when it is put back with the claim it had in an earlier revision of the same entry (same origin, evidence and notes;
// the id and targets aside), and refuses it when the value, the claim or the entry does not match.
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/restore-claims.test.mjs
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
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>Array.isArray(x)||(x!==null&&typeof x==='object')?JSON.stringify(x):x));return q.rows[0];}
async function rejected(promise,pattern){let error=null;try{await promise;}catch(e){error=e;}assert.ok(error,'must be rejected');if(pattern)assert.match(error.message,pattern);return error;}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

test('a removed source-backed item can be put back with its original claim, and only with it',async t=>{
 const user=await connect('authenticated',owner);const worker=await connect('moflo_worker');
 const company=(await call(user,'public.create_company',['Acme','https://acme.example',randomUUID()])).create_company;
 const job=await call(user,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
 const claimed=(await worker.query("SELECT private.claim_job('restore-test') AS job")).rows[0].job;assert.equal(claimed.id,job.id);
 const text='We sell to independent cafes.';
 const capture={normalized_url:'https://acme.example/',final_url:'https://acme.example/',title:'Acme',author:null,site_name:'Acme',published_on:null,retrieved_at:'2026-10-16T00:00:00.000Z',response_status:200,capture_status:'captured',capture_method:'http',cleaned_content:text,content_sha256:createHash('sha256').update(text).digest('hex'),observations:{segments:[{id:'segment-1',text}]},design_evidence:{observations:[]},error_code:null};
 const source=await call(worker,'private.insert_source_capture',[claimed.id,company,claimed.lease_token,capture]);
 const sourceRow={id:source.id,url:source.final_url,title:source.title,author:null,site_name:source.site_name,published_on:null,retrieved_at:source.retrieved_at.toISOString()};
 const evidence={id:randomUUID(),source_page_id:source.id,kind:'text',excerpt:text,technical:null};
 const defaults=(await admin.query("SELECT private.business_defaults() AS v")).rows[0].v;
 const registry=(await admin.query('SELECT private.field_registry() AS v')).rows[0].v;
 const coverage=registry.filter(f=>f.kind==='market_and_customers').map(f=>({targets:[f.path],status:'not_checked',job_id:null,reason:'Entered manually'}));
 const buyer={id:randomUUID(),text};
 const other={id:randomUUID(),text:'Offices'};
 const entry=randomUUID();
 const leaf=id=>`/market_and_customers/target_buyers/@${id}/text`;
 const withBuyers=(...items)=>({...defaults.market_and_customers,target_buyers:items});
 const claim=(id,over={})=>({id,entry_id:entry,targets:[leaf(buyer.id)],origin:'source_backed',evidence_ids:[evidence.id],based_on_claim_ids:[],actor_id:null,authored_at:null,note:'From the website',...over});
 const user_claim=(item)=>({id:randomUUID(),entry_id:entry,targets:[leaf(item.id)],origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:owner,authored_at:'2026-10-16T00:00:00.000Z',note:'Entered by hand'});
 const provenance=(claims,extra={})=>({sources:[sourceRow],evidence:[evidence],claims,coverage,operations:[],conflicts:[],decisions:[],...extra});
 const original=claim(randomUUID());
 // Q20 (provenance-origin-hardening): a member's create_entry takes person-authored values only, so the source-backed
 // revision 1 comes from the first import (finish_job), the trusted path that stores extracted values.
 const progress={stage:'crawling',discovered:1,selected:1,captured:1,failed:0,blocked:0,extracted:0,document_limit:10,limits_reached:[]};
 await call(worker,'private.checkpoint_job',[claimed.id,company,claimed.lease_token,{},progress]);
 await call(worker,'private.checkpoint_job',[claimed.id,company,claimed.lease_token,{},{...progress,stage:'extracting',extracted:1}]);
 const candidate=(kind,content,p)=>({id:randomUUID(),kind,target_entry_id:null,base_revision:null,schema_version:'1.0.0',content,provenance:p,conflicts:[]});
 const others=['company_foundation','positioning','branding_and_style','online_presence'].map(kind=>candidate(kind,defaults[kind],{sources:[],evidence:[],claims:[],coverage:registry.filter(f=>f.kind===kind).map(f=>({targets:[f.path],status:'not_checked',job_id:null,reason:'Not assessed'})),operations:[],conflicts:[],decisions:[]}));
 await call(worker,'private.finish_job',[claimed.id,company,claimed.lease_token,{candidates:[candidate('market_and_customers',withBuyers(buyer,other),provenance([original,user_claim(other)])),...others],decisions:[]},[{targets:['/market_and_customers/target_buyers'],status:'partial',job_id:claimed.id,reason:'Fixture'}]]);
 let rev=(await user.query('SELECT * FROM public.knowledge_entry_versions WHERE company_id=$1 AND entry_id=$2 AND revision=1',[company,entry])).rows[0];
 const entryId=rev.entry_id;
 assert.equal(rev.revision,1);
 const operation=(request,note,supersedes)=>({request_id:request,entry_id:entryId,kind:'user_correction',supersedes_claim_id:supersedes,note});
 const remove=async()=>{
  const request=randomUUID();
  const provenanceAfter={...rev.provenance,sources:[],evidence:[],claims:rev.provenance.claims.filter(c=>c.id!==original.id),operations:[...rev.provenance.operations,operation(request,'Removed buyer',original.id)]};
  return call(user,'public.save_entry_revision',[company,entryId,rev.revision,withBuyers(other),provenanceAfter,'unreviewed','Removed buyer',request]);
 };
 const removed=await remove();assert.equal(removed.revision,2);
 const restoredClaim=over=>({...claim(randomUUID()),entry_id:entryId,...over});
 const put=(content,claims,expected=2,extra={})=>{
  const request=randomUUID();
  return call(user,'public.save_entry_revision',[company,entryId,expected,content,{...removed.provenance,sources:[sourceRow],evidence:[evidence],claims:[...removed.provenance.claims.filter(c=>c.targets.every(target=>!target.includes(buyer.id))),...claims],operations:[...removed.provenance.operations,operation(request,'Put the buyer back',null)],...extra},'unreviewed','Put the buyer back',request]);
 };
 await t.test('a different text under the carried claim is refused (the value must be the one of the earlier revision)',async()=>{
  await rejected(put(withBuyers(other,{...buyer,text:'We sell to everyone.'}),[restoredClaim({targets:[leaf(buyer.id)]})]),/edited_leaf_requires_user_origin|unsupported|evidence/);
 });
 await t.test('a claim that differs from the original (origin, evidence or notes) is refused',async()=>{
  await rejected(put(withBuyers(other,buyer),[restoredClaim({note:'Invented note'})]),/edited_leaf_requires_user_origin/);
  await rejected(put(withBuyers(other,buyer),[restoredClaim({origin:'inferred'})]),/edited_leaf_requires_user_origin|origin_disallowed/);
 });
 await t.test('an item that never existed, or a claim of another entry, cannot be put back as source-backed',async()=>{
  const fresh={id:randomUUID(),text:'Brand new buyer'};
  await rejected(put(withBuyers(other,buyer,fresh),[restoredClaim(),restoredClaim({targets:[leaf(fresh.id)]})]),/edited_leaf_requires_user_origin/);
  await rejected(put(withBuyers(other,buyer),[restoredClaim({entry_id:randomUUID()})]),/claim_entry_mismatch|edited_leaf_requires_user_origin/);
 });
 await t.test('an ordinary edit still needs the editing user\'s own claim',async()=>{
  const added={id:randomUUID(),text:'Studios'};
  await rejected(call(user,'public.save_entry_revision',[company,entryId,removed.revision,withBuyers(other,added),removed.provenance,'unreviewed','Edit',randomUUID()]),/edited_leaf_requires_user_origin/);
 });
 await t.test('the removed item is put back with its source-backed claim: origin and evidence are kept',async()=>{
  const back=await put(withBuyers(other,buyer),[restoredClaim()]);
  assert.equal(back.revision,3);
  const kept=back.provenance.claims.find(c=>c.targets.includes(leaf(buyer.id)));
  assert.equal(kept.origin,'source_backed');assert.deepEqual(kept.evidence_ids,[evidence.id]);
  assert.ok(back.provenance.evidence.some(e=>e.id===evidence.id));
 });
});
