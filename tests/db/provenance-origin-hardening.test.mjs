// Quest Q20 provenance-origin-hardening (security): every member write path checks the origin of every value it stores.
// An editor calling the RPCs directly (as PostgREST does) cannot label any value, changed or not, as source_backed,
// inferred or generated unless that very claim (origin, evidence rows, sources, based_on) already supported that value in
// the entry's history (carried over from the previous revision, or restored with the evidence rows the earlier revision
// had), or it comes from a selected stored candidate, an applied proposal or a worker import. create_entry by a member
// takes person-authored values only. Refusals reach the API as a clear 422 (mapDatabaseError), never as a 503.
// Tests named "guard" lock legitimate paths and pass on the base; the others fail on the base, where the forgery is accepted.
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/provenance-origin-hardening.test.mjs
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {register} from 'node:module';
import {resolve} from 'node:path';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';
const supplied=process.env.TEST_DATABASE_URL;
if(!supplied)throw new Error('NOT_RUN: TEST_DATABASE_URL is required and must point to a disposable *_test database');
if(!new URL(supplied).pathname.endsWith('_test'))throw new Error('Test database name must end _test');
const root=process.env.CONTRACTS_ROOT??'.';
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
// The server modules import "server-only" (a Next.js marker that is no package here): resolve it to an empty module.
register('data:text/javascript,'+encodeURIComponent("export async function resolve(specifier,context,next){if(specifier==='server-only')return {url:'data:text/javascript,export%20%7B%7D',shortCircuit:true};return next(specifier,context);}"));
let administrator,admin,owner,editor,worker,api,registry,defaults;const sessions=[];
const ownerId=randomUUID(),editorId=randomUUID();
async function connect(role,subject){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(subject)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[subject]);return c;}
const encode=x=>x!==null&&typeof x==='object'?JSON.stringify(x):x;
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(encode));return q.rows[0];}
const plain=row=>JSON.parse(JSON.stringify(row));
/** The Supabase client surface the server code uses, answered by one database session (RLS and auth.uid apply). */
function clientOf(session){
 return {
  lastError:null,
  from(table){
   const filters=[];let columns='*';
   const query={
    select(c){columns=c;return query;},
    eq(column,value){filters.push([column,value]);return query;},
    async maybeSingle(){
     const where=filters.map(([column],i)=>`${column}=$${i+1}`).join(' AND ');
     const r=await session.query(`SELECT ${columns} FROM public.${table}${where?' WHERE '+where:''}`,filters.map(([,v])=>v));
     return {data:r.rows[0]?plain(r.rows[0]):null,error:null};
    },
   };
   return query;
  },
  async rpc(name,args){
   const keys=Object.keys(args);
   try{const r=await session.query(`SELECT * FROM public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>encode(args[k])));return {data:plain(r.rows[0]),error:null};}
   catch(e){this.lastError=e;return {data:null,error:{code:e.code,message:e.message,details:e.detail,hint:e.hint}};}
  },
 };
}
let server;
/** One write through the API layer (rpc → mapDatabaseError), as an editor would send it straight to the RPC. */
async function attempt(client,name,args){
 client.lastError=null;
 try{return {data:await server.rpc(client,name,args),error:null};}
 catch(error){return {data:null,error,raw:client.lastError};}
}
function refused(outcome,what){
 assert.ok(outcome.error,`${what}: the forged origin was accepted (revision ${outcome.data?.revision} was written)`);
 return outcome.error;
}
function clear422(outcome,what){
 const e=refused(outcome,what);
 assert.equal(e.status,422,`${what}: the refusal must reach the API as a clear 422, got ${e.status} ${e.code} (database said: ${outcome.raw?.message})`);
}
function accepted(outcome,what){
 assert.equal(outcome.error,null,`${what}: this legitimate write must be accepted, but was refused: ${outcome.raw?.message??outcome.error?.message}`);
 return outcome.data;
}
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1),($2)',[ownerId,editorId]);
 owner=await connect('authenticated',ownerId);editor=await connect('authenticated',editorId);worker=await connect('moflo_worker');
 api={owner:clientOf(owner),editor:clientOf(editor)};
 registry=(await admin.query('SELECT private.field_registry() AS v')).rows[0].v;
 defaults=(await admin.query('SELECT private.business_defaults() AS v')).rows[0].v;
 server={
  ...(await tsImport(resolve(root,'src/server/http.ts'),import.meta.url)),
  ...(await tsImport(resolve(root,'src/server/revisions.ts'),import.meta.url)),
  ...(await tsImport(resolve(root,'src/contracts/api-entries.ts'),import.meta.url)),
 };
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

// Captured website wording. Every excerpt used below (genuine or forged) is a real substring of these segments.
const SEGMENTS=['Acme roasts specialty coffee for independent cafes.','We sell wholesale to offices across the city.','Ada Lovelace leads our roasting team.'];
const OVERVIEW=SEGMENTS[0];
const at='2026-10-16T00:00:00.000Z';
const fieldsOf=(kind,id)=>registry.filter(f=>f.kind===kind).map(f=>f.path.replace('@id','@'+id));
const coverageOf=(kind,id,job=null)=>fieldsOf(kind,id).map(t=>({targets:[t],status:job?'partial':'not_checked',job_id:job,reason:'Fixture coverage'}));
const sourceRow=page=>({id:page.id,url:page.final_url,title:page.title,author:null,site_name:page.site_name,published_on:null,retrieved_at:page.retrieved_at.toISOString()});
const textEvidence=(page,excerpt)=>({id:randomUUID(),source_page_id:page.id,kind:'text',excerpt,technical:null});
const sourced=(entry,targets,origin,evidence,based=[],note='From the website')=>({id:randomUUID(),entry_id:entry,targets,origin,evidence_ids:evidence.map(e=>e.id),based_on_claim_ids:based,actor_id:null,authored_at:null,note});
const typed=(entry,targets,actor,note='Entered by hand')=>({id:randomUUID(),entry_id:entry,targets,origin:'user_provided',evidence_ids:[],based_on_claim_ids:[],actor_id:actor,authored_at:at,note});
async function capture(job,company,path){
 const text=SEGMENTS.join(' ');
 return call(worker,'private.insert_source_capture',[job.id,company,job.lease_token,{normalized_url:'https://acme.example'+path,final_url:'https://acme.example'+path,title:'Acme',author:null,site_name:'Acme',published_on:null,retrieved_at:at,response_status:200,capture_status:'captured',capture_method:'http',cleaned_content:text,content_sha256:createHash('sha256').update(text).digest('hex'),observations:{segments:SEGMENTS.map((t,i)=>({id:'segment-'+i,text:t}))},design_evidence:{observations:[]},error_code:null}]);
}
async function company(name){
 const id=(await call(owner,'public.create_company',[name,'https://acme.example',randomUUID()])).create_company;
 await call(owner,'public.set_company_member',[id,editorId,'editor']);
 return id;
}
async function crawl(companyId){
 const job=await call(owner,'public.enqueue_scrape',[companyId,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
 const claimed=(await worker.query("SELECT private.claim_job('origin-hardening') AS job")).rows[0].job;assert.equal(claimed.id,job.id);
 const home=await capture(claimed,companyId,'/'),mirror=await capture(claimed,companyId,'/mirror');
 return {job:claimed,home,mirror};
}
async function extracting(c,job){
 const progress={stage:'crawling',discovered:2,selected:2,captured:2,failed:0,blocked:0,extracted:0,document_limit:10,limits_reached:[]};
 await call(worker,'private.checkpoint_job',[job.id,c,job.lease_token,{},progress]);
 await call(worker,'private.checkpoint_job',[job.id,c,job.lease_token,{},{...progress,stage:'extracting',extracted:2}]);
}
const revisionOf=async(c,entry)=>plain((await admin.query('SELECT r.* FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=$1 AND e.id=$2',[c,entry])).rows[0]);
const claimFor=(revision,leaf)=>revision.provenance.claims.find(claim=>claim.targets.includes(leaf));

/**
 * A company whose five entries come from a first import (finish_job, a trusted path): the overview is source_backed,
 * the industry inferred and the pitch generated (based on the overview claim); two buyers are source_backed with their
 * own excerpts. The editor then typed the business model through the UI path, so it is user_provided in revision 2.
 */
async function imported(name='Acme'){
 const c=await company(name);const {job,home,mirror}=await crawl(c);
 const foundation=randomUUID(),positioning=randomUUID(),market=randomUUID();
 const ev={overview:textEvidence(home,OVERVIEW),pitch:textEvidence(home,OVERVIEW),cafes:textEvidence(home,'independent cafes'),offices:textEvidence(home,'offices')};
 const overviewClaim=sourced(foundation,['/company_foundation/overview'],'source_backed',[ev.overview]);
 const industryClaim=sourced(foundation,['/company_foundation/industry'],'inferred',[ev.overview],[],'Inferred from the roasting description.');
 const pitchClaim=sourced(positioning,['/positioning/company_pitch'],'generated',[ev.pitch],[overviewClaim.id],'Generated from the recorded overview.');
 const buyers=[{id:randomUUID(),text:'Independent cafes'},{id:randomUUID(),text:'Offices'}];
 const buyerLeaf=id=>`/market_and_customers/target_buyers/@${id}/text`;
 const buyerClaims=[sourced(market,[buyerLeaf(buyers[0].id)],'source_backed',[ev.cafes]),sourced(market,[buyerLeaf(buyers[1].id)],'source_backed',[ev.offices])];
 const p=(entry,kind,evidence,claims)=>({sources:evidence.length?[sourceRow(home)]:[],evidence,claims,coverage:coverageOf(kind,entry,job.id),operations:[],conflicts:[],decisions:[]});
 const candidate=(kind,content,provenance)=>({id:randomUUID(),kind,target_entry_id:null,base_revision:null,schema_version:'1.0.0',content,provenance,conflicts:[]});
 const candidates=[
  candidate('company_foundation',{...defaults.company_foundation,overview:OVERVIEW,industry:'Coffee roasting'},p(foundation,'company_foundation',[ev.overview],[overviewClaim,industryClaim])),
  candidate('positioning',{...defaults.positioning,company_pitch:'Specialty coffee for independent cafes.'},p(positioning,'positioning',[ev.pitch],[pitchClaim])),
  candidate('market_and_customers',{...defaults.market_and_customers,target_buyers:buyers},p(market,'market_and_customers',[ev.cafes,ev.offices],buyerClaims)),
 ];
 for(const kind of ['branding_and_style','online_presence'])candidates.push(candidate(kind,defaults[kind],{sources:[],evidence:[],claims:[],coverage:coverageOf(kind,randomUUID(),job.id),operations:[],conflicts:[],decisions:[]}));
 await extracting(c,job);
 const finished=await call(worker,'private.finish_job',[job.id,c,job.lease_token,{candidates,decisions:[]},[{targets:['/positioning/company_pitch'],status:'partial',job_id:job.id,reason:'Fixture limitation'}]]);
 assert.equal(finished.proposals.initialized_entry_ids.length,5,'fixture: the first import initializes five entries');
 // Entries without claims get ids of their own; the batch lists them in candidate order.
 const ids={foundation,positioning,market,branding_and_style:finished.proposals.initialized_entry_ids[3],online_presence:finished.proposals.initialized_entry_ids[4]};
 // The editor types the business model through the UI path: it becomes user_provided in revision 2.
 const r1=await revisionOf(c,foundation);
 accepted(await uiSave(api.editor,c,foundation,{expectedRevision:1,content:{...r1.content,business_model:'Wholesale coffee'},provenance:r1.provenance,reviewStatus:'unreviewed',reason:'Typed the business model'}),'fixture: UI edit of the business model');
 const r2=await revisionOf(c,foundation);assert.equal(r2.revision,2);assert.equal(claimFor(r2,'/company_foundation/business_model').origin,'user_provided');
 return {c,job,home,mirror,ids,ev,overviewClaim,industryClaim,pitchClaim,buyers,buyerLeaf,buyerClaims};
}
/** The UI path: the route's request schema, the real prepareRevision, then save_entry_revision through rpc. */
async function uiSave(client,c,entry,body){
 const input=server.SaveEntrySchema.parse({requestId:randomUUID(),...body});
 let safe;
 try{safe=await server.prepareRevision(client,c,entry,client===api.editor?editorId:ownerId,input);}
 catch(error){return {data:null,error};}
 return attempt(client,'save_entry_revision',{p_company:c,p_entry:entry,p_expected_revision:input.expectedRevision,p_content:safe.content,p_provenance:safe.provenance,p_review_status:input.reviewStatus,p_reason:input.reason??null,p_request:input.requestId});
}
/** save_entry_revision called directly with the editor's own provenance. */
const directSave=(c,entry,revision,content,provenance,status='unreviewed')=>attempt(api.editor,'save_entry_revision',{p_company:c,p_entry:entry,p_expected_revision:revision,p_content:content,p_provenance:provenance,p_review_status:status,p_reason:'Direct RPC',p_request:randomUUID()});
const directCreate=(c,kind,content,provenance)=>attempt(api.editor,'create_entry',{p_company:c,p_kind:kind,p_content:content,p_provenance:provenance,p_request:randomUUID()});
/** The current provenance with the claim on `leaf` replaced by `claim` (and extra evidence/sources added). */
function relabel(revision,leaf,claim,{evidence=[],sources=[]}={}){
 const p=structuredClone(revision.provenance);
 p.claims=p.claims.map(x=>x.targets.includes(leaf)?{...x,targets:x.targets.filter(t=>t!==leaf)}:x).filter(x=>x.targets.length).concat([claim]);
 p.evidence=[...p.evidence.filter(e=>!evidence.some(n=>n.id===e.id)),...evidence];
 p.sources=[...p.sources,...sources.filter(s=>!p.sources.some(x=>x.id===s.id))];
 return p;
}

// ---------------------------------------------------------------------------------------------------------------------
// C3 / C1: save_entry_revision called directly cannot relabel an unchanged value.
test('C3: an unchanged user_provided value cannot be relabelled source_backed with a genuine captured excerpt',async()=>{
 const f=await imported();const r=await revisionOf(f.c,f.ids.foundation);const leaf='/company_foundation/business_model';
 const forged=textEvidence(f.home,SEGMENTS[1]);
 const outcome=await directSave(f.c,f.ids.foundation,r.revision,r.content,relabel(r,leaf,sourced(f.ids.foundation,[leaf],'source_backed',[forged]),{evidence:[forged]}));
 clear422(outcome,'relabel user_provided → source_backed');
 assert.equal(claimFor(await revisionOf(f.c,f.ids.foundation),leaf).origin,'user_provided');
 // Control: the same request with the value left as the person's own claim is accepted.
 accepted(await directSave(f.c,f.ids.foundation,r.revision,r.content,r.provenance),'unchanged save of the same revision');
});
test('C1: an unchanged user_provided value cannot be relabelled inferred',async()=>{
 const f=await imported();const r=await revisionOf(f.c,f.ids.foundation);const leaf='/company_foundation/business_model';
 const forged=textEvidence(f.home,SEGMENTS[1]);
 clear422(await directSave(f.c,f.ids.foundation,r.revision,r.content,relabel(r,leaf,sourced(f.ids.foundation,[leaf],'inferred',[forged],[],'Inferred from the sales page.'),{evidence:[forged]})),'relabel user_provided → inferred');
});
test('C1: an unchanged user_provided value cannot be relabelled generated (based on a genuine claim)',async()=>{
 const f=await imported();let r=await revisionOf(f.c,f.ids.positioning);const leaf='/positioning/company_pitch';
 accepted(await uiSave(api.editor,f.c,f.ids.positioning,{expectedRevision:r.revision,content:{...r.content,company_pitch:'Coffee that cafes love.'},provenance:r.provenance,reviewStatus:'unreviewed',reason:'Typed the pitch'}),'UI edit of the pitch');
 r=await revisionOf(f.c,f.ids.positioning);assert.equal(claimFor(r,leaf).origin,'user_provided');
 const forged=textEvidence(f.home,OVERVIEW);
 clear422(await directSave(f.c,f.ids.positioning,r.revision,r.content,relabel(r,leaf,sourced(f.ids.positioning,[leaf],'generated',[forged],[f.overviewClaim.id],'Generated.'),{evidence:[forged],sources:[sourceRow(f.home)]})),'relabel user_provided → generated');
});
test('C1: an unchanged inferred value cannot be upgraded to source_backed with the same evidence',async()=>{
 const f=await imported();const r=await revisionOf(f.c,f.ids.foundation);const leaf='/company_foundation/industry';
 clear422(await directSave(f.c,f.ids.foundation,r.revision,r.content,relabel(r,leaf,{...claimFor(r,leaf),id:randomUUID(),targets:[leaf],origin:'source_backed',note:'From the website'})),'upgrade inferred → source_backed');
});
test('C3: the evidence row of a carried claim cannot be swapped for another genuine excerpt',async()=>{
 const f=await imported();const r=await revisionOf(f.c,f.ids.foundation);
 const p=structuredClone(r.provenance);p.evidence=p.evidence.map(e=>e.id===f.ev.overview.id?{...e,excerpt:SEGMENTS[1]}:e);
 // Same claim (id, origin, evidence id), same value; only the excerpt behind the evidence id changed.
 clear422(await directSave(f.c,f.ids.foundation,r.revision,r.content,p),'excerpt swap under a carried claim');
 assert.equal((await revisionOf(f.c,f.ids.foundation)).provenance.evidence.find(e=>e.id===f.ev.overview.id).excerpt,OVERVIEW);
});
test('C3: the evidence row of a carried claim cannot be moved to another captured page',async()=>{
 const f=await imported();const r=await revisionOf(f.c,f.ids.foundation);
 const p=structuredClone(r.provenance);p.evidence=p.evidence.map(e=>e.id===f.ev.overview.id?{...e,source_page_id:f.mirror.id}:e);p.sources=[sourceRow(f.mirror)];
 clear422(await directSave(f.c,f.ids.foundation,r.revision,r.content,p),'source swap under a carried claim');
});
test('C3: another value\'s evidence cannot be attached to an unchanged user_provided value',async()=>{
 const f=await imported();const r=await revisionOf(f.c,f.ids.foundation);const leaf='/company_foundation/business_model';
 // The overview's own (unchanged, previously recorded) evidence row, cited by a new claim on the business model.
 clear422(await directSave(f.c,f.ids.foundation,r.revision,r.content,relabel(r,leaf,sourced(f.ids.foundation,[leaf],'source_backed',[f.ev.overview]))),'borrowed evidence');
});
test('C1: a carried generated claim cannot be re-pointed at other supporting claims',async()=>{
 const f=await imported();const r=await revisionOf(f.c,f.ids.positioning);const leaf='/positioning/company_pitch';
 const old=claimFor(r,leaf);
 clear422(await directSave(f.c,f.ids.positioning,r.revision,r.content,relabel(r,leaf,{...old,id:randomUUID(),targets:[leaf],based_on_claim_ids:[f.industryClaim.id]})),'based_on swap');
});
test('C1: a changed value cannot carry a non-user origin (refused, and as a clear 422)',async()=>{
 // Refused on the base too (edited_leaf_requires_user_origin); C5 demands that the API answers it with 422, not 503.
 const f=await imported();const r=await revisionOf(f.c,f.ids.foundation);const leaf='/company_foundation/business_model';
 const forged=textEvidence(f.home,SEGMENTS[1]);
 clear422(await directSave(f.c,f.ids.foundation,r.revision,{...r.content,business_model:'Wholesale to offices'},relabel(r,leaf,sourced(f.ids.foundation,[leaf],'source_backed',[forged]),{evidence:[forged]})),'changed value labelled source_backed');
});
test('C1: a member cannot plant a non-user conflict candidate and then select it',async()=>{
 const f=await imported();let r=await revisionOf(f.c,f.ids.foundation);const target='/company_foundation/business_model';
 const forged=textEvidence(f.home,SEGMENTS[1]);
 const planted={id:randomUUID(),target,material:false,candidates:[{id:randomUUID(),value:'Wholesale to offices',origin:'source_backed',evidence_ids:[forged.id],based_on_claim_ids:[]},{id:randomUUID(),value:'Wholesale coffee',origin:'user_provided',evidence_ids:[],based_on_claim_ids:[]}]};
 const p=structuredClone(r.provenance);p.conflicts=[...p.conflicts,planted];p.evidence=[...p.evidence,forged];
 const plant=await directSave(f.c,f.ids.foundation,r.revision,r.content,p);
 if(plant.error){clear422(plant,'planting a source_backed candidate');return;}
 r=await revisionOf(f.c,f.ids.foundation);
 const chosen=structuredClone(r.provenance);
 chosen.decisions=[...chosen.decisions,{id:randomUUID(),conflict_id:planted.id,target,action:'select',candidate_id:planted.candidates[0].id,actor_id:editorId,decided_at:at,note:'Selected'}];
 Object.assign(chosen,relabel({provenance:chosen},target,{...sourced(f.ids.foundation,[target],'source_backed',[forged]),note:'Selected'}));
 clear422(await directSave(f.c,f.ids.foundation,r.revision,{...r.content,business_model:'Wholesale to offices'},chosen),'selecting a member-planted source_backed candidate');
});

// 0021 restore: the evidence rows of a restored claim must be the earlier revision's.
async function removedBuyer(f){
 const r1=await revisionOf(f.c,f.ids.market);
 accepted(await uiSave(api.editor,f.c,f.ids.market,{expectedRevision:r1.revision,content:{...r1.content,target_buyers:[f.buyers[1]]},provenance:r1.provenance,reviewStatus:'unreviewed',reason:'Removed a buyer'}),'UI removal of a buyer');
 const r2=await revisionOf(f.c,f.ids.market);assert.ok(!r2.provenance.evidence.some(e=>e.id===f.ev.cafes.id),'fixture: the removed buyer\'s evidence leaves the revision');
 return {r1,r2};
}
function restoreProvenance(f,r2,evidenceRow,sources){
 const leaf=f.buyerLeaf(f.buyers[0].id);
 const p=structuredClone(r2.provenance);
 p.claims=[...p.claims,{...f.buyerClaims[0],id:randomUUID(),targets:[leaf]}];
 p.evidence=[...p.evidence,evidenceRow];p.sources=[...p.sources,...sources.filter(s=>!p.sources.some(x=>x.id===s.id))];
 return p;
}
test('C1 (0021): an Undo restore cannot bring the claim back with a different excerpt behind its evidence id',async()=>{
 const f=await imported();const {r1,r2}=await removedBuyer(f);
 const p=restoreProvenance(f,r2,{...f.ev.cafes,excerpt:'specialty coffee'},[sourceRow(f.home)]);
 clear422(await directSave(f.c,f.ids.market,r2.revision,r1.content,p),'restore with a swapped excerpt');
});
test('C1 (0021): an Undo restore cannot bring the claim back with its evidence moved to another page',async()=>{
 const f=await imported();const {r1,r2}=await removedBuyer(f);
 const p=restoreProvenance(f,r2,{...f.ev.cafes,source_page_id:f.mirror.id},[sourceRow(f.mirror)]);
 clear422(await directSave(f.c,f.ids.market,r2.revision,r1.content,p),'restore with a moved evidence row');
});

// C2: create_entry by a member takes person-authored values only.
async function crawledOnly(name){const c=await company(name);const {job,home}=await crawl(c);await call(worker,'private.fail_job',[job.id,c,job.lease_token,{code:'fixture',url:null,retryable:false,message:'Fixture crawl ends here'}]);return {c,home};}
test('C2: create_entry refuses a source_backed value',async()=>{
 const {c,home}=await crawledOnly('Create source');const e=randomUUID();const ev=textEvidence(home,OVERVIEW);
 const content={...defaults.company_foundation,overview:OVERVIEW};
 clear422(await directCreate(c,'company_foundation',content,{sources:[sourceRow(home)],evidence:[ev],claims:[sourced(e,['/company_foundation/overview'],'source_backed',[ev])],coverage:coverageOf('company_foundation',e),operations:[],conflicts:[],decisions:[]}),'create_entry source_backed');
 // Control: the same value typed by the person is accepted.
 accepted(await directCreate(c,'company_foundation',content,{sources:[],evidence:[],claims:[typed(e,['/company_foundation/overview'],editorId)],coverage:coverageOf('company_foundation',e),operations:[],conflicts:[],decisions:[]}),'create_entry user_provided');
});
test('C2: create_entry refuses an inferred value',async()=>{
 const {c,home}=await crawledOnly('Create inferred');const e=randomUUID();const ev=textEvidence(home,OVERVIEW);
 clear422(await directCreate(c,'company_foundation',{...defaults.company_foundation,industry:'Coffee roasting'},{sources:[sourceRow(home)],evidence:[ev],claims:[sourced(e,['/company_foundation/industry'],'inferred',[ev],[],'Inferred.')],coverage:coverageOf('company_foundation',e),operations:[],conflicts:[],decisions:[]}),'create_entry inferred');
});
test('C2: create_entry refuses a generated value',async()=>{
 const {c,home}=await crawledOnly('Create generated');const e=randomUUID();const ev=textEvidence(home,OVERVIEW);
 const story=sourced(e,['/positioning/founding_story'],'source_backed',[textEvidence(home,SEGMENTS[2])]);
 const evidence=[ev,{...textEvidence(home,SEGMENTS[2]),id:story.evidence_ids[0]}];
 clear422(await directCreate(c,'positioning',{...defaults.positioning,company_pitch:'Coffee for cafes.',founding_story:SEGMENTS[2]},{sources:[sourceRow(home)],evidence,claims:[story,sourced(e,['/positioning/company_pitch'],'generated',[ev],[story.id],'Generated.')],coverage:coverageOf('positioning',e),operations:[],conflicts:[],decisions:[]}),'create_entry generated');
});
test('C2: create_entry of a key person refuses a source_backed name in a company that has imported entries',async()=>{
 const f=await imported('Create person');const person=randomUUID();const ev=textEvidence(f.home,'Ada Lovelace');
 const content={id:person,name:'Ada Lovelace',title:null,role:null,gender:null,background_or_relevance:null,age:null,nationality:null,portrait:null};
 clear422(await directCreate(f.c,'key_person',content,{sources:[sourceRow(f.home)],evidence:[ev],claims:[sourced(person,[`/key_people/@${person}/name`],'source_backed',[ev])],coverage:coverageOf('key_person',person),operations:[],conflicts:[],decisions:[]}),'create_entry key person source_backed');
});
test('C2: create_entry cannot carry a non-user conflict candidate that is selected afterwards',async()=>{
 const f=await imported('Create conflict');const person=randomUUID();const ev=textEvidence(f.home,'Ada Lovelace');const target=`/key_people/@${person}/name`;
 const conflict={id:randomUUID(),target,material:false,candidates:[{id:randomUUID(),value:'Ada Lovelace',origin:'source_backed',evidence_ids:[ev.id],based_on_claim_ids:[]},{id:randomUUID(),value:'A. Lovelace',origin:'user_provided',evidence_ids:[],based_on_claim_ids:[]}]};
 const content={id:person,name:'A. Lovelace',title:null,role:null,gender:null,background_or_relevance:null,age:null,nationality:null,portrait:null};
 const created=await directCreate(f.c,'key_person',content,{sources:[sourceRow(f.home)],evidence:[ev],claims:[typed(person,[target],editorId)],coverage:coverageOf('key_person',person),operations:[],conflicts:[conflict],decisions:[]});
 if(created.error){clear422(created,'create_entry with a source_backed candidate');return;}
 const r=await revisionOf(f.c,person);const p=structuredClone(r.provenance);
 p.decisions=[{id:randomUUID(),conflict_id:conflict.id,target,action:'select',candidate_id:conflict.candidates[0].id,actor_id:editorId,decided_at:at,note:'Selected'}];
 p.claims=[{...sourced(person,[target],'source_backed',[ev]),note:'Selected'}];
 clear422(await directSave(f.c,person,r.revision,{...content,name:'Ada Lovelace'},p),'selecting a candidate planted through create_entry');
});
test('C2 guard: create_entry accepts person-authored values (UI path) and an entry with no claims',async()=>{
 const f=await imported('Create guard');
 const person=randomUUID();const content={id:person,name:'Grace Hopper',title:'Head of sales',role:null,gender:null,background_or_relevance:null,age:null,nationality:null,portrait:null};
 const requestId=randomUUID();const body=server.CreateEntrySchema.parse({kind:'key_person',content,provenance:{sources:[],evidence:[],claims:[],coverage:[],operations:[]},requestId});
 const created=accepted(await attempt(api.editor,'create_entry',{p_company:f.c,p_kind:'key_person',p_content:content,p_provenance:server.prepareManualCreation(body.kind,body.content,requestId,editorId),p_request:requestId}),'UI create of a key person');
 assert.ok(created.provenance.claims.every(claim=>claim.origin==='user_provided'));
 const empty=randomUUID();
 // An entry with no values at all (no claims) is stored by the database (the API's response schema wants a named offering).
 const bare=await call(editor,'public.create_entry',[f.c,'offering',{...registry.filter(x=>x.kind==='offering').reduce((o,x)=>({...o,[x.path.split('/').pop()]:x.default}),{}),id:empty},{sources:[],evidence:[],claims:[],coverage:coverageOf('offering',empty),operations:[],conflicts:[],decisions:[]},randomUUID()]);
 assert.equal(bare.revision,1);
});

// C4 guards: the legitimate paths keep working (they pass on the base and must still pass).
test('C4 guard: first import (finish_job) stores source_backed, inferred and generated values',async()=>{
 const f=await imported('Import guard');
 const foundation=await revisionOf(f.c,f.ids.foundation);const positioning=await revisionOf(f.c,f.ids.positioning);
 assert.equal(claimFor(foundation,'/company_foundation/overview').origin,'source_backed');
 assert.equal(claimFor(foundation,'/company_foundation/industry').origin,'inferred');
 assert.equal(claimFor(positioning,'/positioning/company_pitch').origin,'generated');
});
test('C4 guard: an ordinary UI edit keeps the unchanged values\' claims, evidence and origins',async()=>{
 const f=await imported('Edit guard');const r=await revisionOf(f.c,f.ids.foundation);
 const saved=accepted(await uiSave(api.editor,f.c,f.ids.foundation,{expectedRevision:r.revision,content:{...r.content,year_founded:2015},provenance:r.provenance,reviewStatus:'unreviewed',reason:'Typed the founding year'}),'UI edit');
 assert.equal(claimFor(saved,'/company_foundation/year_founded').origin,'user_provided');
 assert.deepEqual(claimFor(saved,'/company_foundation/overview'),f.overviewClaim);
 assert.equal(claimFor(saved,'/company_foundation/industry').origin,'inferred');
 assert.deepEqual(saved.provenance.evidence.find(e=>e.id===f.ev.overview.id),f.ev.overview);
 // An edit of the source-backed value itself makes it the person's.
 const edited=accepted(await uiSave(api.editor,f.c,f.ids.foundation,{expectedRevision:saved.revision,content:{...saved.content,overview:'Acme roasts coffee.'},provenance:saved.provenance,reviewStatus:'unreviewed',reason:'Shortened'}),'UI edit of a source-backed value');
 assert.equal(claimFor(edited,'/company_foundation/overview').origin,'user_provided');
});
test('C4 guard: approving unchanged imported entries through the UI path, then publishing',async()=>{
 const f=await imported('Publish guard');
 for(const entry of Object.values(f.ids)){
  const r=await revisionOf(f.c,entry);
  const saved=accepted(await uiSave(api.editor,f.c,entry,{expectedRevision:r.revision,content:r.content,provenance:r.provenance,reviewStatus:'approved',reason:'Reviewed'}),'UI approval');
  assert.deepEqual(saved.provenance.claims.map(x=>[x.id,x.origin]),r.provenance.claims.map(x=>[x.id,x.origin]));
 }
 const generation=(await owner.query('SELECT draft_generation FROM public.companies WHERE id=$1',[f.c])).rows[0].draft_generation;
 const snapshot=accepted(await attempt(api.owner,'publish_knowledge_base',{p_company:f.c,p_expected_generation:Number(generation),p_request:randomUUID()}),'publication');
 const origins=snapshot.payload.provenance.claims.map(x=>x.origin);
 for(const origin of ['source_backed','inferred','generated','user_provided'])assert.ok(origins.includes(origin),`the snapshot keeps a ${origin} claim`);
});
test('C4 guard: a direct save that changes nothing but the review status carries every claim over',async()=>{
 const f=await imported('Carry guard');
 for(const entry of [f.ids.foundation,f.ids.positioning,f.ids.market]){const r=await revisionOf(f.c,entry);accepted(await directSave(f.c,entry,r.revision,r.content,r.provenance,'approved'),'direct no-op approval');}
});
test('C4 guard: revert_entry restores an earlier revision with its source-backed claims',async()=>{
 const f=await imported('Revert guard');const r=await revisionOf(f.c,f.ids.foundation);
 const reverted=accepted(await attempt(api.editor,'revert_entry',{p_company:f.c,p_entry:f.ids.foundation,p_from_revision:1,p_expected_revision:r.revision,p_request:randomUUID()}),'revert');
 assert.equal(reverted.content.business_model,null);assert.deepEqual(claimFor(reverted,'/company_foundation/overview'),f.overviewClaim);
});
test('C4 guard: an Undo through the UI path restores a removed item with its original claim and evidence',async()=>{
 const f=await imported('Undo guard');const {r1,r2}=await removedBuyer(f);const leaf=f.buyerLeaf(f.buyers[0].id);
 const back=accepted(await uiSave(api.editor,f.c,f.ids.market,{expectedRevision:r2.revision,content:r1.content,provenance:r2.provenance,reviewStatus:'unreviewed',reason:'Undo',restoreFrom:{revision:1,itemIds:[f.buyers[0].id]}}),'UI Undo');
 const claim=claimFor(back,leaf);assert.equal(claim.origin,'source_backed');assert.deepEqual(claim.evidence_ids,[f.ev.cafes.id]);
 assert.deepEqual(back.provenance.evidence.find(e=>e.id===f.ev.cafes.id),f.ev.cafes);
 // The same restore sent straight to the RPC, with the earlier revision's own evidence row, is accepted too.
 const {r2:again}=await removedBuyer(f);
 accepted(await directSave(f.c,f.ids.market,again.revision,r1.content,restoreProvenance(f,again,f.ev.cafes,[sourceRow(f.home)])),'direct restore with the earlier evidence row');
});
test('C4 guard: an applied proposal with a conflict, then the UI switching to the other stored candidate',async()=>{
 const f=await imported('Proposal guard');const before=await revisionOf(f.c,f.ids.foundation);const target='/company_foundation/overview';
 const enqueued=await call(owner,'public.enqueue_scrape',[f.c,'https://acme.example',{max_pages:10,max_depth:2},randomUUID()]);
 const job=(await worker.query("SELECT private.claim_job('origin-hardening-proposal') AS job")).rows[0].job;assert.equal(job.id,enqueued.id);
 const page=await capture(job,f.c,'/second');
 const a=textEvidence(page,OVERVIEW),b=textEvidence(page,SEGMENTS[1]);
 const conflict={id:randomUUID(),target,material:true,candidates:[{id:randomUUID(),value:OVERVIEW,origin:'source_backed',evidence_ids:[a.id],based_on_claim_ids:[]},{id:randomUUID(),value:'Acme sells wholesale coffee to offices.',origin:'source_backed',evidence_ids:[b.id],based_on_claim_ids:[]}]};
 const candidate={id:randomUUID(),kind:'company_foundation',target_entry_id:f.ids.foundation,base_revision:before.revision,schema_version:'1.0.0',content:{...defaults.company_foundation,overview:OVERVIEW},provenance:{sources:[sourceRow(page)],evidence:[a,b],claims:[sourced(f.ids.foundation,[target],'source_backed',[a])],coverage:coverageOf('company_foundation',f.ids.foundation,job.id),operations:[],conflicts:[],decisions:[]},conflicts:[conflict]};
 await extracting(f.c,job);
 await call(worker,'private.finish_job',[job.id,f.c,job.lease_token,{candidates:[candidate],decisions:[]},[{targets:[target],status:'conflict',job_id:job.id,reason:'Two wordings'}]]);
 const applied=accepted(await attempt(api.editor,'apply_proposal',{p_company:f.c,p_job:job.id,p_proposal:candidate.id,p_entry:f.ids.foundation,p_expected_revision:before.revision,p_selected_candidate_ids:[conflict.candidates[1].id],p_request:randomUUID()}),'apply_proposal');
 assert.equal(applied.content.overview,conflict.candidates[1].value);assert.equal(claimFor(applied,target).origin,'source_backed');
 assert.equal(claimFor(applied,'/company_foundation/business_model').origin,'user_provided');assert.equal(claimFor(applied,'/company_foundation/industry').origin,'inferred');
 // The reviewer switches to the other stored candidate through the UI path.
 const decision=applied.provenance.decisions.find(d=>d.conflict_id===conflict.id);
 const switched=accepted(await uiSave(api.editor,f.c,f.ids.foundation,{expectedRevision:applied.revision,content:{...applied.content,overview:OVERVIEW},provenance:{...applied.provenance,decisions:[{...decision,id:randomUUID(),candidate_id:conflict.candidates[0].id,decided_at:new Date().toISOString()}]},reviewStatus:'unreviewed',reason:'Chose the other wording'}),'UI selection of a stored candidate');
 const chosen=claimFor(switched,target);assert.equal(chosen.origin,'source_backed');assert.deepEqual(chosen.evidence_ids,[a.id]);
 // And the selected entry can still be approved unchanged.
 accepted(await uiSave(api.editor,f.c,f.ids.foundation,{expectedRevision:switched.revision,content:switched.content,provenance:switched.provenance,reviewStatus:'approved',reason:'Reviewed'}),'approval after selection');
});
test('C1 guard: an origin outside the contract (historical_*) is refused as a validation error',async()=>{
 const f=await imported('Historical');const r=await revisionOf(f.c,f.ids.foundation);const leaf='/company_foundation/business_model';
 clear422(await directSave(f.c,f.ids.foundation,r.revision,r.content,relabel(r,leaf,{...sourced(f.ids.foundation,[leaf],'historical_import',[f.ev.overview])})),'historical_* origin');
});
