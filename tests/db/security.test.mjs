import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';
import {resolve} from 'node:path';
const supplied=process.env.TEST_DATABASE_URL;
if(!supplied)throw new Error('NOT_RUN: TEST_DATABASE_URL is required and must point to a disposable *_test database');
const original=new URL(supplied);
if(!original.pathname.endsWith('_test'))throw new Error('Test database name must end _test');
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
let administrator,admin;const sessions=[];
const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID();
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);return q.rows[0];}
async function denied(p,pattern){await assert.rejects(p,e=>pattern.test(e.message));}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 for(const file of (await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
  await admin.query('RESET ROLE');await admin.query(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 }
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[owner,viewer,outsider]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});
function provenance(entryId,actor,text='Initial self-provided company wording'){
 return {sources:[],evidence:[],claims:[{id:randomUUID(),entry_id:entryId,targets:['/positioning/company_pitch'],origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:actor,authored_at:'2026-10-16T00:00:00.000Z',note:text}],coverage:[{targets:['/positioning/company_pitch','/positioning/founding_story'],status:'not_checked',job_id:null,reason:'Manual entry'}],operations:[],conflicts:[],decisions:[]};
}
test('protected manual path, tenant isolation, immutable history, worker fencing and concurrency',async t=>{
 const user=await connect('authenticated',owner);const readOnly=await connect('authenticated',viewer);const stranger=await connect('authenticated',outsider);const worker=await connect('moflo_worker');
 const request=randomUUID();let company,entry,rev,published,job;
 await t.test('atomic creation, idempotency and membership RLS',async()=>{
  company=(await call(user,'public.create_company',['Acme','https://acme.example',request])).create_company;
  assert.equal((await call(user,'public.create_company',['Acme','https://acme.example',request])).create_company,company);
  await denied(call(user,'public.create_company',['Changed','https://acme.example',request]),/idempotency_conflict/);
  await call(user,'public.set_company_member',[company,viewer,'viewer']);
  assert.equal((await user.query('SELECT * FROM public.companies')).rowCount,1);
  assert.equal((await readOnly.query('SELECT * FROM public.companies')).rowCount,1);
  assert.equal((await stranger.query('SELECT * FROM public.companies')).rowCount,0);
  await denied(call(stranger,'public.update_company',[company,0,'Leak',null]),/unavailable/);
  await denied(call(readOnly,'public.update_company',[company,0,'Viewer',null]),/forbidden/);
  await denied(user.query("INSERT INTO public.company_members(company_id,user_id,role,added_by) VALUES($1,$2,'owner',$2)",[company,outsider]),/permission denied/);
  await denied(user.query('UPDATE public.companies SET draft_generation=123 WHERE id=$1',[company]),/permission denied/);
  await denied(worker.query('SELECT * FROM public.source_pages'),/permission denied/);
  await denied(user.query("SELECT private.claim_job('browser')"),/permission denied/);
  await denied(call(user,'public.set_company_member',[company,owner,null]),/last_owner/);
 });
 await t.test('validated immutable revisions and retry-safe saves',async()=>{
  entry=randomUUID();const p=provenance(entry,owner);const body={company_pitch:'We support teams.',founding_story:null};const request=randomUUID();
  rev=await call(user,'public.create_entry',[company,'positioning',body,p,request]);assert.equal(rev.revision,1);
  assert.equal((await call(user,'public.create_entry',[company,'positioning',body,p,request])).id,rev.id);
  await denied(call(user,'public.save_entry_revision',[company,entry,1,{...body,rogue:true},rev.provenance,'approved',null,randomUUID()]),/unknown_key/);
  await denied(call(user,'public.save_entry_revision',[company,entry,1,{...body,company_pitch:'Unclaimed replacement'},{...p,claims:[]},'approved',null,randomUUID()]),/unclaimed_leaf/);
  const saveArgs=[company,entry,1,body,rev.provenance,'approved','Reviewed',randomUUID()];rev=await call(user,'public.save_entry_revision',saveArgs);
  assert.equal(rev.revision,2);assert.equal((await call(user,'public.save_entry_revision',saveArgs)).id,rev.id);
  await denied(call(user,'public.save_entry_revision',[company,entry,1,body,p,'approved',null,randomUUID()]),/stale_revision/);
  await denied(admin.query('UPDATE public.knowledge_entry_versions SET review_status=$1 WHERE id=$2',['rejected',rev.id]),/immutable_record/);
 });
 await t.test('publication freezes payload with canonical checksum and idempotent version allocation',async()=>{
  const c=(await user.query('SELECT * FROM public.companies WHERE id=$1',[company])).rows[0];const request=randomUUID();
  published=await call(user,'public.publish_knowledge_base',[company,c.draft_generation,request]);
  assert.equal(published.version_number,'1');assert.equal(published.payload.positioning.company_pitch,'We support teams.');
  const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  assert.equal(published.payload_sha256,createHash('sha256').update(canonical(published.payload)).digest('hex'));
  const {assembleKnowledgeBase}=await tsImport(resolve(process.env.CONTRACTS_ROOT??'.','src/knowledge/assemble.ts'),import.meta.url);
  const rows=(await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[company])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
  assert.deepEqual(published.payload,assembleKnowledgeBase({company:{id:company,name:'Acme',website:'https://acme.example'},snapshotId:published.id,version:1,savedAt:published.created_at.toISOString(),authorId:owner,entries:rows}));
  assert.equal((await call(user,'public.publish_knowledge_base',[company,c.draft_generation,request])).id,published.id);
  await denied(call(user,'public.publish_knowledge_base',[company,99,request]),/idempotency_conflict/);
  await denied(admin.query('DELETE FROM public.knowledge_base_versions WHERE id=$1',[published.id]),/immutable_record/);
  await user.query('UPDATE public.companies SET name=$1 WHERE id=$2',['Renamed',company]);
  assert.equal((await user.query('SELECT payload FROM public.knowledge_base_versions WHERE id=$1',[published.id])).rows[0].payload.provenance.company.name,'Acme');
 });
 await t.test('one-active job, captured source integrity, lease fencing and membership revocation',async()=>{
  job=await call(user,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
  await denied(call(user,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]),/active_job/);
  const claimed=(await worker.query("SELECT private.claim_job('worker-test') AS job")).rows[0].job;assert.equal(claimed.id,job.id);assert.deepEqual(claimed.source_captures,[]);job=claimed;
  await denied(call(worker,'private.heartbeat_job',[job.id,company,randomUUID()]),/invalid_lease/);
  const text='Welcome to Acme.';const capture={normalized_url:'https://acme.example/',final_url:'https://acme.example/',title:'Acme',author:null,site_name:'Acme',published_on:null,retrieved_at:'2026-10-16T00:00:00.000Z',response_status:200,capture_status:'captured',capture_method:'http',cleaned_content:text,content_sha256:createHash('sha256').update(text).digest('hex'),observations:{segments:[{id:'segment-1',text}]},design_evidence:{observations:[]},error_code:null};
  const source=await call(worker,'private.insert_source_capture',[job.id,company,job.lease_token,capture]);assert.equal((await call(worker,'private.insert_source_capture',[job.id,company,job.lease_token,capture])).id,source.id);
  await denied(call(worker,'private.insert_source_capture',[job.id,company,job.lease_token,{...capture,cleaned_content:'Changed'}]),/capture_idempotency_conflict/);
  await denied(admin.query('UPDATE public.source_pages SET title=$1 WHERE id=$2',['tampered',source.id]),/immutable_record/);
  const bad=provenance(entry,owner);bad.sources=[{id:randomUUID(),url:'https://other.example',title:null,author:null,site_name:null,published_on:null,retrieved_at:'2026-10-16T00:00:00.000Z'}];
  await denied(call(user,'public.save_entry_revision',[company,entry,2,rev.content,bad,'approved',null,randomUUID()]),/unavailable_source/);
  // A second owner removes the original requester; no elevated worker authority survives that removal.
  await call(user,'public.set_company_member',[company,outsider,'owner']);await call(stranger,'public.set_company_member',[company,owner,'viewer']);
  await denied(call(worker,'private.heartbeat_job',[job.id,company,job.lease_token]),/requester_unavailable/);
  await call(stranger,'public.set_company_member',[company,owner,'owner']);
  await call(user,'public.cancel_scrape',[company,job.id]);await call(worker,'private.fail_job',[job.id,company,job.lease_token,{code:'cancelled',url:null,retryable:false,message:'Cancelled by user'}]);
 });
 await t.test('concurrent stale saves serialize and immutable snapshots reflect a whole revision',async()=>{
  const second=await connect('authenticated',owner);const firstArgs=[company,entry,2,rev.content,rev.provenance,'approved','first',randomUUID()];const secondArgs=[company,entry,2,rev.content,rev.provenance,'approved','second',randomUUID()];
  const results=await Promise.allSettled([call(user,'public.save_entry_revision',firstArgs),call(second,'public.save_entry_revision',secondArgs)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/stale_revision/);
  const c=(await user.query('SELECT * FROM public.companies WHERE id=$1',[company])).rows[0];
  const versions=await Promise.all([call(user,'public.publish_knowledge_base',[company,c.draft_generation,randomUUID()]),call(second,'public.publish_knowledge_base',[company,c.draft_generation,randomUUID()])]);
  assert.deepEqual(versions.map(v=>Number(v.version_number)).sort(),[2,3]);assert.ok(versions.every(v=>v.entry_manifest[0].revision===3));
 });
});
