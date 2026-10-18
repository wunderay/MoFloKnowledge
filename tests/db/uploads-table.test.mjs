// Write path of public.uploads: the app inserts and deletes metadata rows as the signed-in user,
// so row level security alone must enforce role, tenant, archived company and author. Needs TEST_DATABASE_URL (see scripts/test-db.mjs).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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
const owner=randomUUID(),editor=randomUUID(),viewer=randomUUID(),rival=randomUUID();
let A,B,C;
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);return q.rows[0];}
async function rejected(promise,message){let error=null;try{await promise;}catch(e){error=e;}assert.ok(error,message);}
const path=(company,kind='logos')=>`${kind}/${company}/${randomUUID()}.png`;
const insert=(client,company,{by,p,kind='logos'}={})=>client.query("INSERT INTO public.uploads(id,company_id,kind,path,content_type,size_bytes,created_by) VALUES($1,$2,$3,$4,'image/png',68,$5)",[randomUUID(),company,kind,p??path(company,kind),by]);
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const migrated=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 await admin.query('RESET ROLE');await admin.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4)',[owner,editor,viewer,rival]);
 const asOwner=await connect('authenticated',owner),asRival=await connect('authenticated',rival);
 A=(await call(asOwner,'public.create_company',['Acme','https://acme.example',randomUUID()])).create_company;
 C=(await call(asOwner,'public.create_company',['Archive Me','https://archive.example',randomUUID()])).create_company;
 B=(await call(asRival,'public.create_company',['Rival','https://rival.example',randomUUID()])).create_company;
 for(const company of [A,C])for(const [user,role] of [[editor,'editor'],[viewer,'viewer']])await call(asOwner,'public.set_company_member',[company,user,role]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});
test('public.uploads writes: owner and editor only, own company, own authorship, live company',async t=>{
 const user=await connect('authenticated',owner),ed=await connect('authenticated',editor),view=await connect('authenticated',viewer),other=await connect('authenticated',rival),anon=await connect('anon');
 await t.test('owner and editor insert; viewer, other-company owner and anon cannot',async()=>{
  await insert(user,A,{by:owner});await insert(ed,A,{by:editor,kind:'portraits'});
  await rejected(insert(view,A,{by:viewer}),'viewer');await rejected(insert(other,A,{by:rival}),'other company');await rejected(insert(anon,A,{by:owner}),'anon');
 });
 await t.test('the author cannot be forged and the path must belong to the row company, kind and canonical shape',async()=>{
  await rejected(insert(ed,A,{by:owner}),'created_by must be the caller');
  await rejected(insert(ed,A,{by:editor,p:path(B)}),'path of another company');
  await rejected(insert(ed,A,{by:editor,p:path(A,'portraits')}),'path kind differs from kind');
  await rejected(insert(ed,A,{by:editor,p:`logos/${A}/../${B}/x.png`}),'traversal path');
  await rejected(insert(ed,A,{by:editor,p:`logos/${A}/logo.png`}),'client style file name');
 });
 await t.test('an archived company takes no new rows and keeps its rows',async()=>{
  const kept=randomUUID(),p=path(C);
  await admin.query("INSERT INTO public.uploads(id,company_id,kind,path,content_type,size_bytes,created_by) VALUES($1,$2,'logos',$3,'image/png',68,$4)",[kept,C,p,owner]);
  const generation=(await admin.query('SELECT draft_generation FROM public.companies WHERE id=$1',[C])).rows[0].draft_generation;
  await call(user,'public.archive_company',[C,generation]);
  await rejected(insert(user,C,{by:owner}),'owner into archived company');
  assert.equal((await user.query('DELETE FROM public.uploads WHERE id=$1',[kept])).rowCount,0,'no delete in an archived company');
  assert.equal((await view.query('SELECT 1 FROM public.uploads WHERE id=$1',[kept])).rowCount,1,'members still read');
 });
 await t.test('delete is owner or editor of the same company; rows cannot be updated at all',async()=>{
  const id=randomUUID(),p=path(A);
  await admin.query("INSERT INTO public.uploads(id,company_id,kind,path,content_type,size_bytes,created_by) VALUES($1,$2,'logos',$3,'image/png',68,$4)",[id,A,p,owner]);
  for(const client of [view,other,anon])assert.equal((await client.query('DELETE FROM public.uploads WHERE id=$1',[id]).then(r=>r.rowCount,()=>0)),0);
  await rejected(user.query("UPDATE public.uploads SET size_bytes=1 WHERE id=$1",[id]),'no update privilege');
  assert.equal((await ed.query('DELETE FROM public.uploads WHERE id=$1',[id])).rowCount,1);
 });
});
