import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
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
let administrator,admin;const sessions=[];
const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID();
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(x=>Array.isArray(x)?JSON.stringify(x):x));return q.rows[0];}
async function denied(p,pattern){await assert.rejects(p,e=>pattern.test(e.message));}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const generated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/generate-sql-contract.mjs',import.meta.url)),'--check',process.env.CONTRACTS_ROOT??'.'],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 const migration=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});
 const initial=migration();assert.equal(initial.status,0,initial.stderr);assert.equal(initial.stdout.match(/Applied /g)?.length,13);
 const replay=migration();assert.equal(replay.status,0,replay.stderr);assert.equal(replay.stdout,'');
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[owner,viewer,outsider]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});
function provenance(entryId,actor,text='Initial self-provided company wording'){
 return {sources:[],evidence:[],claims:[{id:randomUUID(),entry_id:entryId,targets:['/positioning/company_pitch'],origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:actor,authored_at:'2026-10-16T00:00:00.000Z',note:text}],coverage:[{targets:['/positioning/company_pitch','/positioning/founding_story'],status:'not_checked',job_id:null,reason:'Manual entry'}],operations:[],conflicts:[],decisions:[]};
}
test('protected manual path, tenant isolation, immutable history, worker fencing and concurrency',async t=>{
 const anonymous=await connect('anon');const user=await connect('authenticated',owner);const readOnly=await connect('authenticated',viewer);const stranger=await connect('authenticated',outsider);const worker=await connect('moflo_worker');
 const request=randomUUID();let company,entry,rev,published,job;
 await t.test('atomic creation, idempotency and membership RLS',async()=>{
  company=(await call(user,'public.create_company',['Acme','https://acme.example',request])).create_company;
  assert.equal((await call(user,'public.create_company',['Acme','https://acme.example',request])).create_company,company);
  await denied(call(user,'public.create_company',['Changed','https://acme.example',request]),/idempotency_conflict/);
  await call(user,'public.set_company_member',[company,viewer,'viewer']);
  await denied(call(user,'public.set_company_member',[company,randomUUID(),'viewer']),/unavailable/);await denied(call(user,'public.set_company_member',[company,randomUUID(),null]),/unavailable/);
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
  for(const table of ['companies','company_members','scrape_jobs','source_pages','knowledge_entries','knowledge_entry_versions','knowledge_base_versions'])await denied(anonymous.query(`SELECT * FROM public.${table}`),/permission denied/);
 });
 await t.test('validated immutable revisions and retry-safe saves',async()=>{
  entry=randomUUID();const p=provenance(entry,owner);const body={company_pitch:'We support teams.',founding_story:null};const request=randomUUID();
  rev=await call(user,'public.create_entry',[company,'positioning',body,p,request]);assert.equal(rev.revision,1);
  assert.equal((await call(user,'public.create_entry',[company,'positioning',body,p,request])).id,rev.id);
  await denied(call(user,'public.save_entry_revision',[company,entry,1,{...body,rogue:true},rev.provenance,'approved',null,randomUUID()]),/unknown_key/);
  await denied(call(user,'public.save_entry_revision',[company,entry,1,{...body,company_pitch:'Unclaimed replacement'},{...p,claims:[]},'approved',null,randomUUID()]),/unclaimed_leaf|edited_leaf_requires_user_origin/);
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
  const numeric={alpha:1e-7,threshold:1e-6,ordinary:0.5,text:'Résumé 🚀'};assert.equal((await admin.query('SELECT private.canonical_json($1::jsonb) value',[JSON.stringify(numeric)])).rows[0].value,canonical(numeric));
  const {assembleKnowledgeBase}=await tsImport(resolve(process.env.CONTRACTS_ROOT??'.','src/knowledge/assemble.ts'),import.meta.url);
  const rows=(await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[company])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
  assert.deepEqual(published.payload,assembleKnowledgeBase({company:{id:company,name:'Acme',website:'https://acme.example'},snapshotId:published.id,version:1,savedAt:published.created_at.toISOString(),authorId:owner,entries:rows}));
  assert.equal((await call(user,'public.publish_knowledge_base',[company,c.draft_generation,request])).id,published.id);
  await denied(call(user,'public.publish_knowledge_base',[company,99,request]),/idempotency_conflict/);
  await denied(admin.query('DELETE FROM public.knowledge_base_versions WHERE id=$1',[published.id]),/immutable_record/);
  await user.query('UPDATE public.companies SET name=$1 WHERE id=$2',['Renamed',company]);
  const stalePublishRequest=randomUUID();
  await assert.rejects(call(user,'public.publish_knowledge_base',[company,c.draft_generation,stalePublishRequest]),error=>{assert.match(error.message,/stale_generation/);assert.equal(JSON.parse(error.detail).currentGeneration,Number(c.draft_generation)+1);return true;});
  assert.equal((await user.query('SELECT id FROM public.knowledge_base_versions WHERE company_id=$1 AND request_id=$2',[company,stalePublishRequest])).rowCount,0);
  assert.equal((await user.query('SELECT next_snapshot_version FROM public.companies WHERE id=$1',[company])).rows[0].next_snapshot_version,'2');
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
  const checkpoint={stage:'crawling',effectiveRoot:'https://acme.example/',frontier:{root:'https://acme.example/',pending:[{url:'https://acme.example/about',depth:1,score:20}],seen:['https://acme.example/','https://acme.example/about'],aliases:[],selected:1,limitsReached:[]},budgets:{documents:1,htmlBytes:200,designBytes:0,startedAt:Date.now(),limitsReached:[]},captured_source_ids:[source.id],extracted_source_ids:[],errors:[]};const crawlProgress={stage:'crawling',discovered:2,selected:1,captured:1,failed:0,blocked:0,extracted:0,document_limit:10,limits_reached:[]};
  await call(worker,'private.checkpoint_job',[job.id,company,job.lease_token,checkpoint,crawlProgress]);
  await denied(call(worker,'private.checkpoint_job',[job.id,company,job.lease_token,{...checkpoint,budgets:{...checkpoint.budgets,documents:-1}},crawlProgress]),/number_range/);
  await denied(call(worker,'private.checkpoint_job',[job.id,company,job.lease_token,{...checkpoint,captured_source_ids:[randomUUID()]},crawlProgress]),/unavailable_checkpoint_source/);
  const stale=job.lease_token;await admin.query("UPDATE public.scrape_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[job.id]);
  job=(await worker.query("SELECT private.claim_job('restarted-worker') AS job")).rows[0].job;assert.equal(job.attempt_count,2);assert.notEqual(job.lease_token,stale);assert.equal(job.source_captures[0].id,source.id);assert.equal(job.checkpoint.frontier.pending[0].url,'https://acme.example/about');
  await denied(call(worker,'private.heartbeat_job',[job.id,company,stale]),/invalid_lease/);

  const bad=provenance(entry,owner);bad.sources=[{id:randomUUID(),url:'https://other.example',title:null,author:null,site_name:null,published_on:null,retrieved_at:'2026-10-16T00:00:00.000Z'}];
  await denied(call(user,'public.save_entry_revision',[company,entry,2,rev.content,bad,'approved',null,randomUUID()]),/unavailable_source/);
  // A second owner removes the original requester; no elevated worker authority survives that removal.
  await call(user,'public.set_company_member',[company,outsider,'owner']);await call(stranger,'public.set_company_member',[company,owner,'viewer']);
  await denied(call(worker,'private.heartbeat_job',[job.id,company,job.lease_token]),/requester_unavailable/);
  await call(stranger,'public.set_company_member',[company,owner,'owner']);
  await call(user,'public.cancel_scrape',[company,job.id]);await call(worker,'private.fail_job',[job.id,company,job.lease_token,{code:'cancelled',url:null,retryable:false,message:'Cancelled by user'}]);
 });
 await t.test('first-import batch validates cross-entry supports and finalizes exactly once',async()=>{
  const c=(await call(user,'public.create_company',['Imported','https://import.example',randomUUID()])).create_company;
  const enqueued=await call(user,'public.enqueue_scrape',[c,'https://import.example',{max_pages:10,max_depth:2},randomUUID()]);
  const claimed=(await worker.query("SELECT private.claim_job('first-import') AS job")).rows[0].job;assert.equal(claimed.id,enqueued.id);
  const text='Acme builds software.';const capture={normalized_url:'https://import.example/',final_url:'https://import.example/',title:'Imported',retrieved_at:'2026-10-16T00:00:00.000Z',response_status:200,capture_status:'captured',capture_method:'http',cleaned_content:text,content_sha256:createHash('sha256').update(text).digest('hex'),observations:{segments:[{id:'s1',text}]},design_evidence:{observations:[]}};
  const source=await call(worker,'private.insert_source_capture',[claimed.id,c,claimed.lease_token,capture]);
  const selfDescription='I identify as a woman.';const teamSource=await call(worker,'private.insert_source_capture',[claimed.id,c,claimed.lease_token,{...capture,normalized_url:'https://import.example/team',final_url:'https://import.example/team',cleaned_content:selfDescription,content_sha256:createHash('sha256').update(selfDescription).digest('hex'),observations:{segments:[{id:'self-description',text:selfDescription}]}}]);
  const a=randomUUID(),b=randomUUID(),foundationClaim=randomUUID(),pitchClaim=randomUUID(),evidence=randomUUID();
  const metadata={id:source.id,url:source.final_url,title:source.title,author:null,site_name:null,published_on:null,retrieved_at:source.retrieved_at.toISOString()};
  const ev={id:evidence,source_page_id:source.id,kind:'text',excerpt:text,technical:null};
  const crossTenant=provenance(entry,owner);crossTenant.sources=[metadata];await denied(call(user,'public.save_entry_revision',[company,entry,2,rev.content,crossTenant,'approved',null,randomUUID()]),/unavailable_source/);
  const defaults=JSON.parse(await readFile(resolve(process.env.CONTRACTS_ROOT??'.','src/contracts/defaults.json'),'utf8'));
  const fields=JSON.parse(await readFile(resolve(process.env.CONTRACTS_ROOT??'.','src/contracts/field-registry.json'),'utf8'));
  const p=(id,claim,target,origin,support)=>({sources:[metadata],evidence:[ev],claims:[{id:claim,entry_id:id,targets:[target],origin,evidence_ids:[evidence],based_on_claim_ids:support,actor_id:null,authored_at:null,note:null}],coverage:[{targets:fields.filter(f=>f.kind===(id===a?'company_foundation':'positioning')).map(f=>f.path),status:'partial',job_id:claimed.id,reason:'Bounded fixture evidence'}],operations:[],conflicts:[],decisions:[]});
  const candidates=[{id:randomUUID(),kind:'positioning',target_entry_id:null,base_revision:null,schema_version:'1.0.0',content:{company_pitch:'Software for teams.',founding_story:null},provenance:p(b,pitchClaim,'/positioning/company_pitch','generated',[foundationClaim]),conflicts:[]},{id:randomUUID(),kind:'company_foundation',target_entry_id:null,base_revision:null,schema_version:'1.0.0',content:{...defaults.company_foundation,overview:text},provenance:p(a,foundationClaim,'/company_foundation/overview','source_backed',[]),conflicts:[]}];
  for(const kind of ['market_and_customers','branding_and_style','online_presence'])candidates.push({id:randomUUID(),kind,target_entry_id:null,base_revision:null,schema_version:'1.0.0',content:defaults[kind],provenance:{sources:[],evidence:[],claims:[],coverage:[{targets:fields.filter(f=>f.kind===kind).map(f=>f.path),status:'not_checked',job_id:claimed.id,reason:'No checked fixture observation'}],operations:[],conflicts:[],decisions:[]},conflicts:[]});
  candidates[1].content.industry='Software';candidates[1].provenance.claims.push({...candidates[1].provenance.claims[0],id:randomUUID(),targets:['/company_foundation/industry'],origin:'inferred',note:'Inferred from the captured software description.'});
  const progress={stage:'crawling',discovered:1,selected:1,captured:1,failed:0,blocked:0,extracted:0,document_limit:10,limits_reached:[]};
  await call(worker,'private.checkpoint_job',[claimed.id,c,claimed.lease_token,{},progress]);await call(worker,'private.checkpoint_job',[claimed.id,c,claimed.lease_token,{}, {...progress,stage:'extracting',extracted:1}]);
  const finish=[claimed.id,c,claimed.lease_token,{candidates,decisions:[]},[{targets:['/positioning/company_pitch'],status:'partial',job_id:claimed.id,reason:'Fixture limitation'}]];
  const forged=structuredClone(finish);forged[3].candidates[0].provenance.evidence[0].excerpt='A fabricated quotation.';await denied(call(worker,'private.finish_job',forged),/unsupported_excerpt/);
  const fakeTechnical=structuredClone(finish);fakeTechnical[3].candidates[0].provenance.evidence[0]={...fakeTechnical[3].candidates[0].provenance.evidence[0],kind:'technical',excerpt:null,technical:{selector:'h1',property:'font-family',value:'Unsupported Font',asset_url:null}};await denied(call(worker,'private.finish_job',fakeTechnical),/unsupported_technical_evidence/);
  const result=await call(worker,'private.finish_job',finish);assert.equal(result.status,'partial');assert.equal(result.proposals.initialized_entry_ids.length,5);
  assert.equal((await call(worker,'private.finish_job',finish)).id,result.id);
  assert.equal((await user.query('SELECT * FROM public.knowledge_entries WHERE company_id=$1',[c])).rowCount,5);
  const revisions=(await user.query('SELECT * FROM public.knowledge_entry_versions WHERE company_id=$1',[c])).rows;
  for(const r of revisions)await call(user,'public.save_entry_revision',[c,r.entry_id,1,r.content,r.provenance,'approved','Fixture review',randomUUID()]);
  const generation=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[c])).rows[0].draft_generation;
  const snapshot=await call(user,'public.publish_knowledge_base',[c,generation,randomUUID()]);assert.equal(snapshot.payload.provenance.claims.length,3);assert.equal(snapshot.payload.provenance.sources.length,1);
  const position=(await user.query('SELECT * FROM public.knowledge_entry_versions WHERE company_id=$1 AND entry_id=$2 AND revision=2',[c,b])).rows[0];const manualProvenance=structuredClone(position.provenance);manualProvenance.claims.push({id:randomUUID(),entry_id:b,targets:['/positioning/founding_story'],origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:owner,authored_at:'2026-10-16T00:00:00.000Z',note:'The company supplied this narrative.'});
  const manual=await call(user,'public.save_entry_revision',[c,b,2,{...position.content,founding_story:'User verified origin story.'},manualProvenance,'unreviewed','Manual story',randomUUID()]);await call(user,'public.save_entry_revision',[c,b,3,manual.content,manual.provenance,'approved','Review user story',randomUUID()]);
  const personId=randomUUID();const person={id:personId,name:'Excluded internal person',title:null,role:null,gender:'woman',background_or_relevance:null};const personP={sources:[],evidence:[],claims:[{id:randomUUID(),entry_id:personId,targets:[`/key_people/@${personId}/name`],origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:owner,authored_at:'2026-10-16T00:00:00.000Z',note:'User supplied this internal candidate.'}],coverage:[{targets:fields.filter(f=>f.kind==='key_person').map(f=>f.path.replace('@id','@'+personId)),status:'not_checked',job_id:null,reason:'Manual candidate'}],operations:[],conflicts:[],decisions:[]};const genderEvidence={id:randomUUID(),source_page_id:teamSource.id,kind:'text',excerpt:selfDescription,technical:null};personP.sources=[{id:teamSource.id,url:teamSource.final_url,title:teamSource.title,author:null,site_name:null,published_on:null,retrieved_at:teamSource.retrieved_at.toISOString()}];personP.evidence=[genderEvidence];personP.claims.push({id:randomUUID(),entry_id:personId,targets:[`/key_people/@${personId}/gender`],origin:'source_backed',evidence_ids:[genderEvidence.id],based_on_claim_ids:[],actor_id:null,authored_at:null,note:null});
  const unrelated=structuredClone(personP);unrelated.sources=[metadata];unrelated.evidence=[{...genderEvidence,source_page_id:source.id,excerpt:text}];unrelated.claims[1].note='Explicit public self-description';await denied(call(user,'public.create_entry',[c,'key_person',person,unrelated,randomUUID()]),/gender_self_description_required/);
  const personRow=await call(user,'public.create_entry',[c,'key_person',person,personP,randomUUID()]);await call(user,'public.save_entry_revision',[c,personId,1,person,personRow.provenance,'rejected','Unnecessary personal data',randomUUID()]);
  const offeringId=randomUUID(),featureId=randomUUID();const offering={id:offeringId,name:'Workspace',description:null,offering_type:null,category:null,features:[{id:featureId,text:'Version history'}],pricing:{kind:'paid',raw:'USD 29 per month',amount:'29.00',min_amount:null,max_amount:null,currency:'USD',billing_interval:'month',pricing_model:null,qualifications:[],as_of:null},url:null};
  const targets=[`/offerings/@${offeringId}/name`,`/offerings/@${offeringId}/features/@${featureId}/text`,...['kind','raw','amount','currency','billing_interval'].map(k=>`/offerings/@${offeringId}/pricing/${k}`)];const offeringP={sources:[],evidence:[],claims:[{id:randomUUID(),entry_id:offeringId,targets,origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:owner,authored_at:'2026-10-16T00:00:00.000Z',note:'User supplied the offering and its stated price.'}],coverage:[{targets:fields.filter(f=>f.kind==='offering').map(f=>f.path.replace('@id','@'+offeringId)),status:'not_checked',job_id:null,reason:'Manual offering'}],operations:[],conflicts:[],decisions:[]};const offeringRow=await call(user,'public.create_entry',[c,'offering',offering,offeringP,randomUUID()]);await call(user,'public.save_entry_revision',[c,offeringId,1,offering,offeringRow.provenance,'approved','User statement reviewed',randomUUID()]);
  // A subsequent scrape retains proposals until an explicit choice creates a new revision.
  const secondJob=await call(user,'public.enqueue_scrape',[c,'https://import.example',{max_pages:10,max_depth:2},randomUUID()]);
  const next=(await worker.query("SELECT private.claim_job('rescrape') AS job")).rows[0].job;assert.equal(next.id,secondJob.id);assert.equal(next.current_entries.length,7);
  for(const table of ['companies','company_members','scrape_jobs','source_pages','knowledge_entries','knowledge_entry_versions','knowledge_base_versions'])assert.equal((await readOnly.query(`SELECT * FROM public.${table} WHERE ${table==='companies'?'id':'company_id'}=$1`,[c])).rowCount,0);
  const source2=await call(worker,'private.insert_source_capture',[next.id,c,next.lease_token,capture]);
  const ev2={...ev,id:randomUUID(),source_page_id:source2.id};const conflict={id:randomUUID(),target:'/positioning/company_pitch',material:true,candidates:[{id:randomUUID(),value:'Acme builds software.',origin:'source_backed',evidence_ids:[ev2.id],based_on_claim_ids:[]},{id:randomUUID(),value:'Software by Acme.',origin:'source_backed',evidence_ids:[ev2.id],based_on_claim_ids:[]}]};
  const candidate={id:randomUUID(),kind:'positioning',target_entry_id:b,base_revision:4,schema_version:'1.0.0',content:{company_pitch:'Acme builds software.',founding_story:null},provenance:{sources:[{...metadata,id:source2.id}],evidence:[ev2],claims:[{id:randomUUID(),entry_id:b,targets:['/positioning/company_pitch'],origin:'source_backed',evidence_ids:[ev2.id],based_on_claim_ids:[],actor_id:null,authored_at:null,note:null}],coverage:[{targets:['/positioning/company_pitch','/positioning/founding_story'],status:'conflict',job_id:next.id,reason:'Reviewer selection required'}],operations:[],conflicts:[],decisions:[]},conflicts:[conflict]};
  await call(worker,'private.checkpoint_job',[next.id,c,next.lease_token,{}, {...progress,stage:'extracting'}]);
  const finalized=await call(worker,'private.finish_job',[next.id,c,next.lease_token,{candidates:[candidate],decisions:[]},candidate.provenance.coverage]);assert.deepEqual(finalized.proposals.initialized_entry_ids,[]);
  await denied(call(user,'public.apply_proposal',[c,next.id,candidate.id,b,4,[],randomUUID()]),/invalid_candidate_selection/);
  const applyArgs=[c,next.id,candidate.id,b,4,[conflict.candidates[1].id],randomUUID()];const applied=await call(user,'public.apply_proposal',applyArgs);assert.equal(applied.content.company_pitch,'Software by Acme.');assert.equal(applied.review_status,'unreviewed');assert.equal(applied.content.founding_story,'User verified origin story.');assert.equal(applied.provenance.claims.find(c=>c.targets.includes('/positioning/founding_story')).origin,'user_provided');assert.equal((await call(user,'public.apply_proposal',applyArgs)).id,applied.id);
  await denied(call(user,'public.save_entry_revision',[c,b,5,applied.content,{...applied.provenance,decisions:applied.provenance.decisions.map(d=>({...d,actor_id:viewer}))},'approved',null,randomUUID()]),/decision_actor_mismatch/);
  await denied(call(user,'public.save_entry_revision',[c,b,5,{...applied.content,company_pitch:'Tampered source fact'},applied.provenance,'approved',null,randomUUID()]),/edited_leaf_requires_user_origin/);
  const reviewed=await call(user,'public.save_entry_revision',[c,b,5,applied.content,applied.provenance,'approved','Selected evidence reviewed',randomUUID()]);assert.equal(reviewed.revision,6);
  const state=(await user.query('SELECT * FROM public.companies WHERE id=$1',[c])).rows[0];const finalSnapshot=await call(user,'public.publish_knowledge_base',[c,state.draft_generation,randomUUID()]);
  const current=(await user.query('SELECT e.id entry_id,e.kind,e.created_at,r.revision,r.review_status,r.author_id,r.created_at saved_at,r.content,r.provenance FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 ORDER BY e.created_at,e.id',[c])).rows.map(r=>({...r,created_at:r.created_at.toISOString(),saved_at:r.saved_at.toISOString()}));
  const {assembleKnowledgeBase}=await tsImport(resolve(process.env.CONTRACTS_ROOT??'.','src/knowledge/assemble.ts'),import.meta.url);
  assert.deepEqual(finalSnapshot.payload,assembleKnowledgeBase({company:{id:c,name:'Imported',website:'https://import.example'},snapshotId:finalSnapshot.id,version:2,savedAt:finalSnapshot.created_at.toISOString(),authorId:owner,entries:current}));
  assert.deepEqual(finalSnapshot.payload.key_people,[]);assert.equal(finalSnapshot.payload.offerings[0].pricing.amount,'29.00');assert.ok(!JSON.stringify(finalSnapshot.payload).includes('Excluded internal person'));assert.ok(!JSON.stringify(finalSnapshot.payload).includes(selfDescription));
  assert.ok(finalSnapshot.payload.provenance.operations.some(op=>op.kind==='conflict_select'));assert.equal(finalSnapshot.payload.provenance.sources.length,2);
  const switchProvenance=structuredClone(reviewed.provenance);switchProvenance.decisions=[{...switchProvenance.decisions[0],id:randomUUID(),candidate_id:conflict.candidates[0].id,decided_at:new Date().toISOString()}];switchProvenance.claims=switchProvenance.claims.map(claim=>claim.targets.includes('/positioning/company_pitch')?{...claim,id:randomUUID()}:claim);
  const switched=await call(user,'public.save_entry_revision',[c,b,6,{...reviewed.content,company_pitch:conflict.candidates[0].value},switchProvenance,'unreviewed','Explicitly selected stored source candidate',randomUUID()]);assert.equal(switched.provenance.claims.find(claim=>claim.targets.includes('/positioning/company_pitch')).origin,'source_backed');
  // A consistent later scrape has selectable ordinary updates, not only conflicts.
  const thirdJob=await call(user,'public.enqueue_scrape',[c,'https://import.example',{max_pages:10,max_depth:2},randomUUID()]);const third=(await worker.query("SELECT private.claim_job('ordinary-changes') AS job")).rows[0].job;assert.equal(third.id,thirdJob.id);
  const newText='New consistent pitch. Scraped replacement story. Proposed replacement name. Bulk API.';const newSource=await call(worker,'private.insert_source_capture',[third.id,c,third.lease_token,{...capture,cleaned_content:newText,content_sha256:createHash('sha256').update(newText).digest('hex'),observations:{segments:[{id:'new-segment',text:newText}]}}]);const newEvidence={id:randomUUID(),source_page_id:newSource.id,kind:'text',excerpt:newText,technical:null};const newMetadata={...metadata,id:newSource.id,retrieved_at:newSource.retrieved_at.toISOString()};
  const pitchChange=randomUUID(),storyChange=randomUUID();const ordinary={id:randomUUID(),kind:'positioning',target_entry_id:b,base_revision:7,schema_version:'1.0.0',content:{company_pitch:'New consistent pitch.',founding_story:'Scraped replacement story.'},provenance:{sources:[newMetadata],evidence:[newEvidence],claims:['company_pitch','founding_story'].map(field=>({id:randomUUID(),entry_id:b,targets:['/positioning/'+field],origin:'source_backed',evidence_ids:[newEvidence.id],based_on_claim_ids:[],actor_id:null,authored_at:null,note:null})),coverage:['company_pitch','founding_story'].map(field=>({targets:['/positioning/'+field],status:'found',job_id:third.id,reason:null})),operations:[],conflicts:[],decisions:[]},conflicts:[],changes:[{id:pitchChange,target:'/positioning/company_pitch'},{id:storyChange,target:'/positioning/founding_story'}]};
  const featuresChange=randomUUID(),nameChange=randomUUID(),newFeature=randomUUID();const offeringProposal={id:randomUUID(),kind:'offering',target_entry_id:offeringId,base_revision:2,schema_version:'1.0.0',content:{...offering,name:'Proposed replacement name',features:[{id:newFeature,text:'Bulk API'}],pricing:null},provenance:{sources:[newMetadata],evidence:[newEvidence],claims:[`/offerings/@${offeringId}/name`,`/offerings/@${offeringId}/features/@${newFeature}/text`].map(target=>({id:randomUUID(),entry_id:offeringId,targets:[target],origin:'source_backed',evidence_ids:[newEvidence.id],based_on_claim_ids:[],actor_id:null,authored_at:null,note:null})),coverage:fields.filter(f=>f.kind==='offering').map(field=>({targets:[field.path.replace('@id','@'+offeringId)],status:'partial',job_id:third.id,reason:'Only selected fields observed'})),operations:[],conflicts:[],decisions:[]},conflicts:[],changes:[{id:featuresChange,target:`/offerings/@${offeringId}/features`},{id:nameChange,target:`/offerings/@${offeringId}/name`}]};
  await call(worker,'private.checkpoint_job',[third.id,c,third.lease_token,{}, {...progress,stage:'extracting'}]);await call(worker,'private.finish_job',[third.id,c,third.lease_token,{candidates:[ordinary,offeringProposal],decisions:[]},ordinary.provenance.coverage]);
  const ordinaryArgs=[c,third.id,ordinary.id,b,7,[pitchChange],randomUUID()];const ordinaryApplied=await call(user,'public.apply_proposal',ordinaryArgs);assert.equal(ordinaryApplied.content.company_pitch,'New consistent pitch.');assert.equal(ordinaryApplied.content.founding_story,'User verified origin story.');assert.equal(ordinaryApplied.provenance.claims.find(claim=>claim.targets.includes('/positioning/founding_story')).id,switched.provenance.claims.find(claim=>claim.targets.includes('/positioning/founding_story')).id);assert.deepEqual(ordinaryApplied.provenance.coverage.find(cv=>cv.targets.includes('/positioning/founding_story')),switched.provenance.coverage.find(cv=>cv.targets.includes('/positioning/founding_story')));assert.equal((await call(user,'public.apply_proposal',ordinaryArgs)).id,ordinaryApplied.id);
  const collectionApplied=await call(user,'public.apply_proposal',[c,third.id,offeringProposal.id,offeringId,2,[featuresChange],randomUUID()]);assert.deepEqual(collectionApplied.content.features,[{id:newFeature,text:'Bulk API'}]);assert.equal(collectionApplied.content.name,'Workspace');assert.equal(collectionApplied.content.pricing.amount,'29.00');assert.equal(collectionApplied.provenance.claims.find(claim=>claim.targets.includes(`/offerings/@${offeringId}/features/@${newFeature}/text`)).origin,'source_backed');
  const recorded=(await user.query('SELECT proposals FROM public.scrape_jobs WHERE id=$1',[third.id])).rows[0].proposals;assert.equal(recorded.candidates[0].changes.length,2);assert.deepEqual(recorded.decisions[0].selected_candidate_ids,[pitchChange]);
  const dismissed=await call(user,'public.dismiss_proposal',[c,next.id,candidate.id,'Already reviewed']);assert.equal(dismissed.proposals.candidates.length,1);assert.equal(dismissed.proposals.decisions.at(-1).action,'dismiss');

 });
 await t.test('unresolved conflict history cannot be removed to manufacture approval',async()=>{
  const c=(await call(user,'public.create_company',['Conflict','https://conflict.example',randomUUID()])).create_company;const e=randomUUID();const p=provenance(e,owner);const conflict={id:randomUUID(),target:'/positioning/company_pitch',material:true,candidates:[{id:randomUUID(),value:'One wording',origin:'user_provided',evidence_ids:[],based_on_claim_ids:[]},{id:randomUUID(),value:'Another wording',origin:'user_provided',evidence_ids:[],based_on_claim_ids:[]}]};p.conflicts=[conflict];const row=await call(user,'public.create_entry',[c,'positioning',{company_pitch:'One wording',founding_story:null},p,randomUUID()]);
  await denied(call(user,'public.save_entry_revision',[c,e,1,row.content,{...row.provenance,conflicts:[]},'approved',null,randomUUID()]),/conflict_history_must_be_retained/);
 });
 await t.test('a rename waiting on a row lock cannot outlive committed role revocation',async()=>{
  await call(user,'public.set_company_member',[company,viewer,'editor']);
  await user.query('BEGIN');await call(user,'public.set_company_member',[company,viewer,'viewer']);
  const pending=readOnly.query('UPDATE public.companies SET name=$1 WHERE id=$2',['Unauthorized after revocation',company]).then(result=>({result}),error=>({error}));
  for(let attempt=0;;attempt++){
   const state=(await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[readOnly.processID])).rows[0];
   if(state?.wait_event_type==='Lock')break;if(attempt>=100)throw new Error('Expected controlled row lock was not observed');await new Promise(resolve=>setTimeout(resolve,10));
  }
  await user.query('COMMIT');const outcome=await pending;assert.match(outcome.error?.message??'',/forbidden/);
 });
 await t.test('concurrent stale saves serialize and immutable snapshots reflect a whole revision',async()=>{
  const second=await connect('authenticated',owner);const firstArgs=[company,entry,2,rev.content,rev.provenance,'approved','first',randomUUID()];const secondArgs=[company,entry,2,rev.content,rev.provenance,'approved','second',randomUUID()];
  const results=await Promise.allSettled([call(user,'public.save_entry_revision',firstArgs),call(second,'public.save_entry_revision',secondArgs)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/stale_revision/);
  const c=(await user.query('SELECT * FROM public.companies WHERE id=$1',[company])).rows[0];
  const versions=await Promise.all([call(user,'public.publish_knowledge_base',[company,c.draft_generation,randomUUID()]),call(second,'public.publish_knowledge_base',[company,c.draft_generation,randomUUID()])]);
  assert.deepEqual(versions.map(v=>Number(v.version_number)).sort(),[2,3]);assert.ok(versions.every(v=>v.entry_manifest[0].revision===3));
  const before=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation;
  await user.query('BEGIN');await call(user,'public.save_entry_revision',[company,entry,3,rev.content,rev.provenance,'approved','Serialized save',randomUUID()]);
  const pending=call(second,'public.publish_knowledge_base',[company,Number(before)+1,randomUUID()]);
  for(let attempt=0;;attempt++){if((await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[second.processID])).rows[0]?.wait_event_type==='Lock')break;if(attempt>=100)throw new Error('Publication did not wait on the draft lock');await new Promise(resolve=>setTimeout(resolve,10));}
  await user.query('COMMIT');assert.equal((await pending).entry_manifest[0].revision,4);

 });
 await t.test('bounded crash attempts, revert, owner serialization and archive retain history',async()=>{
  const queued=await call(user,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:3},randomUUID()]);
  for(let attempt=1;attempt<=3;attempt++){const j=(await worker.query("SELECT private.claim_job('crash-cap') AS job")).rows[0].job;assert.equal(j.attempt_count,attempt);await admin.query("UPDATE public.scrape_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[j.id]);}
  assert.equal((await worker.query("SELECT private.claim_job('crash-cap') AS job")).rows[0].job,null);assert.equal((await user.query('SELECT status FROM public.scrape_jobs WHERE id=$1',[queued.id])).rows[0].status,'failed');
  const old=await call(user,'public.revert_entry',[company,entry,1,4,randomUUID()]);assert.equal(old.revision,5);assert.equal(old.review_status,'unreviewed');assert.equal(old.content.company_pitch,'We support teams.');assert.equal((await user.query('SELECT payload FROM public.knowledge_base_versions WHERE id=$1',[published.id])).rows[0].payload.positioning.company_pitch,'We support teams.');
  await assert.rejects(call(user,'public.revert_entry',[company,entry,1,4,randomUUID()]),error=>{assert.match(error.message,/stale_revision/);assert.equal(JSON.parse(error.detail).currentRevision,5);return true;});
  assert.equal((await user.query('SELECT current_revision FROM public.knowledge_entries WHERE company_id=$1 AND id=$2',[company,entry])).rows[0].current_revision,5);
  assert.equal((await user.query('SELECT count(*) FROM public.knowledge_entry_versions WHERE company_id=$1 AND entry_id=$2',[company,entry])).rows[0].count,'5');
  const other=(await call(user,'public.create_company',['Owners','https://owners.example',randomUUID()])).create_company;await call(user,'public.set_company_member',[other,outsider,'owner']);
  const removals=await Promise.allSettled([call(user,'public.set_company_member',[other,owner,'viewer']),call(stranger,'public.set_company_member',[other,outsider,'viewer'])]);assert.equal(removals.filter(r=>r.status==='fulfilled').length,1);assert.match(removals.find(r=>r.status==='rejected').reason.message,/last_owner/);
  const beforeMetadata=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation;const changed=await call(user,'public.update_company',[company,beforeMetadata,null,'https://acme.example/updated']);assert.equal(Number(changed.draft_generation),Number(beforeMetadata)+1);
  const active=await call(user,'public.enqueue_scrape',[company,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);const generation=(await user.query('SELECT draft_generation FROM public.companies WHERE id=$1',[company])).rows[0].draft_generation;
  await call(user,'public.archive_company',[company,generation]);assert.equal((await readOnly.query('SELECT payload FROM public.knowledge_base_versions WHERE id=$1',[published.id])).rowCount,1);assert.equal((await user.query('SELECT status FROM public.scrape_jobs WHERE id=$1',[active.id])).rows[0].status,'cancelled');await denied(call(user,'public.update_company',[company,Number(generation)+1,'Archived mutation',null]),/company_archived/);
 });

});
