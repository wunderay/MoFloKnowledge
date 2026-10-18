// The storage bucket and its policies, and the database side of serving and deleting uploads
// (tenant isolation, write roles, archived company). Needs a disposable PostgreSQL (see scripts/test-db.mjs):
//   TEST_DATABASE_URL=postgres://.../anything_test node --test tests/db/storage-uploads.test.mjs
// Without TEST_DATABASE_URL this file reports NOT_RUN (it never passes silently).
//
// There is no Supabase Storage service on the test cluster, so tests/db/storage-shim.sql supplies a minimal
// `storage` schema (buckets, objects with path_tokens, foldername/filename/extension, RLS switched on, Supabase-style
// broad grants). What this proves: the migration's bucket row and storage.objects policies, evaluated by PostgreSQL
// row level security for the `authenticated` and `anon` roles. What it cannot prove: that the real Storage API,
// which sets owner/owner_id/metadata itself and authenticates by JWT, hits these same policies.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const supplied=process.env.TEST_DATABASE_URL;
if(!supplied)throw new Error('NOT_RUN: TEST_DATABASE_URL is required and must point to a disposable *_test database');
const original=new URL(supplied);
if(!original.pathname.endsWith('_test'))throw new Error('Test database name must end _test');
const database=`moflo_${randomUUID().replaceAll('-','')}_test`;
const url=new URL(supplied);url.pathname='/'+database;
let administrator,admin;const sessions=[];
const owner=randomUUID(),editor=randomUUID(),viewer=randomUUID(),outsider=randomUUID(),rival=randomUUID(),removed=randomUUID();
const BUCKET='knowledge-assets';
let A,B,C;
async function connect(role,user){const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);if(role)await c.query(`SET ROLE ${role}`);if(user)await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);return c;}
async function call(client,name,args=[]){const q=await client.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);return q.rows[0];}
async function rejected(promise,message='must be rejected'){let error=null;try{await promise;}catch(e){error=e;}assert.ok(error,message);return error;}
const insertObject=(client,name,bucket=BUCKET)=>client.query('INSERT INTO storage.objects(bucket_id,name,owner,metadata) VALUES($1,$2,auth.uid(),$3)',[bucket,name,JSON.stringify({size:1,mimetype:'image/png'})]);
const names=async(client,where='')=>(await client.query(`SELECT name FROM storage.objects ${where} ORDER BY name`)).rows.map(r=>r.name);
const seed=async(name,bucket=BUCKET)=>{await admin.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)',[bucket,name,JSON.stringify({size:1})]);return name;};
const bucketReady=async()=>assert.equal((await admin.query('SELECT 1 FROM storage.buckets WHERE id=$1',[BUCKET])).rowCount,1,'the migration must create the knowledge-assets bucket row before objects can be stored');
const file=(kind,company)=>`${kind}/${company}/${randomUUID()}.png`;
before(async()=>{
 administrator=new pg.Client({connectionString:supplied});await administrator.connect();await administrator.query(`CREATE DATABASE "${database}"`);
 admin=await connect();
 await admin.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 await admin.query(await readFile(new URL('./storage-shim.sql',import.meta.url),'utf8'));
 const migration=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/migrate.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});
 const initial=migration();assert.equal(initial.status,0,initial.stderr);
 const files=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql'));
 assert.equal(initial.stdout.match(/Applied /g)?.length,files.length,'every migration file must apply on top of the storage shim');
 const replay=migration();assert.equal(replay.status,0,replay.stderr);assert.equal(replay.stdout,'','replaying migrations must be a no-op');
 await admin.query('RESET ROLE');
 await admin.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4),($5),($6)',[owner,editor,viewer,outsider,rival,removed]);
 const asOwner=await connect('authenticated',owner),asRival=await connect('authenticated',rival);
 A=(await call(asOwner,'public.create_company',['Acme','https://acme.example',randomUUID()])).create_company;
 C=(await call(asOwner,'public.create_company',['Archive Me','https://archive.example',randomUUID()])).create_company;
 B=(await call(asRival,'public.create_company',['Rival','https://rival.example',randomUUID()])).create_company;
 for(const company of [A,C])for(const [user,role] of [[editor,'editor'],[viewer,'viewer'],[removed,'editor']])await call(asOwner,'public.set_company_member',[company,user,role]);
});
after(async()=>{for(const c of sessions)await c.end();if(administrator){await administrator.query(`DROP DATABASE "${database}"`);await administrator.end();}});

test('a new migration provisions the private knowledge-assets bucket',async t=>{
 await t.test('the migration set grew beyond 0017 and one new file names the bucket',async()=>{
  const files=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql'));
  const added=files.filter(f=>Number(f.split('_')[0])>17);
  assert.ok(added.length>=1,'a migration after 0017 must exist');
  const bodies=await Promise.all(added.map(f=>readFile(new URL(`../../supabase/migrations/${f}`,import.meta.url),'utf8')));
  assert.ok(bodies.some(b=>b.includes(BUCKET)),'a new migration must create the knowledge-assets bucket');
 });
 await t.test('storage.buckets has exactly one knowledge-assets row and it is private',async()=>{
  const {rows}=await admin.query('SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id=$1 OR name=$1',[BUCKET]);
  assert.equal(rows.length,1,'one bucket row');
  assert.equal(rows[0].id,BUCKET);assert.equal(rows[0].name,BUCKET);
  assert.equal(rows[0].public,false,'the bucket must be private: no public bucket URL');
 });
 await t.test('bucket-level limits, if any, are never looser than the application limits',async()=>{
  const {rows}=await admin.query('SELECT file_size_limit,allowed_mime_types FROM storage.buckets WHERE id=$1',[BUCKET]);
  assert.equal(rows.length,1,'the bucket row must exist');
  if(rows[0].file_size_limit!==null)assert.ok(Number(rows[0].file_size_limit)<=10*1024*1024,'file_size_limit must be at most 10 MiB');
  if(rows[0].allowed_mime_types!==null)for(const type of rows[0].allowed_mime_types)assert.ok(['image/png','image/jpeg','image/jpg','image/gif','image/webp','image/svg+xml'].includes(type),`mime type ${type} is not an allowed image type`);
 });
 await t.test('RLS stays on for storage.objects and at least one policy is written for the bucket',async()=>{
  const flags=(await admin.query("SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass")).rows[0];
  assert.equal(flags.relrowsecurity,true);
  const policies=(await admin.query("SELECT policyname,cmd,roles::text AS roles,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects'")).rows;
  assert.ok(policies.some(p=>`${p.qual??''}${p.with_check??''}`.includes(BUCKET)),'a policy must be scoped to the knowledge-assets bucket');
  for(const cmd of ['SELECT','INSERT','DELETE'])assert.ok(policies.some(p=>(p.cmd===cmd||p.cmd==='ALL')&&`${p.qual??''}${p.with_check??''}`.includes(BUCKET)),`a ${cmd} policy for the bucket must exist`);
  for(const p of policies.filter(p=>`${p.qual??''}${p.with_check??''}`.includes(BUCKET)))assert.ok(!/anon|public/.test(p.roles.replace(/authenticated/g,'')),`policy ${p.policyname} must not apply to anon or PUBLIC: ${p.roles}`);
 });
});

test('reads follow company membership through the second path segment',async t=>{
 await bucketReady();
 const user=await connect('authenticated',owner),ed=await connect('authenticated',editor),view=await connect('authenticated',viewer),stranger=await connect('authenticated',outsider),other=await connect('authenticated',rival),anon=await connect('anon');
 const mine={logos:await seed(file('logos',A)),portraits:await seed(file('portraits',A)),offering:await seed(file('offering-images',A))};
 const theirs=await seed(file('logos',B));
 const wrongBucketBucket='other-assets';
 await admin.query("INSERT INTO storage.buckets(id,name,public) VALUES($1,$1,false)",[wrongBucketBucket]);
 const elsewhere=await seed(file('logos',A),wrongBucketBucket);
 await t.test('owner, editor and viewer of A read all three kinds of A and nothing of B',async()=>{
  for(const client of [user,ed,view]){
   const seen=await names(client,`WHERE bucket_id='${BUCKET}'`);
   for(const name of Object.values(mine))assert.ok(seen.includes(name),`${name} must be readable by a member`);
   assert.ok(!seen.includes(theirs),'another company\'s object must be invisible');
  }
 });
 await t.test('a non-member sees nothing of A; the owner of B sees only B',async()=>{
  assert.deepEqual(await names(stranger,`WHERE bucket_id='${BUCKET}'`),[]);
  assert.deepEqual(await names(other,`WHERE bucket_id='${BUCKET}'`),[theirs]);
 });
 await t.test('anon sees nothing and cannot write',async()=>{
  assert.deepEqual(await names(anon,''),[]);
  await rejected(insertObject(anon,file('logos',A)),'anon insert must be refused');
  assert.equal((await anon.query('DELETE FROM storage.objects')).rowCount,0);
 });
 await t.test('the policies do not extend to other buckets even for the same path shape',async()=>{
  assert.ok(!(await names(user,`WHERE bucket_id='${wrongBucketBucket}'`)).includes(elsewhere));
  await rejected(insertObject(ed,file('logos',A),wrongBucketBucket),'writing into another bucket must be refused');
 });
 await t.test('a path whose company segment is not a uuid never errors a read and is never visible',async()=>{
  await seed(`logos/not-a-uuid/${randomUUID()}.png`);
  await seed(`logos`);
  await seed(`logos/`);
  await seed(`///`);
  for(const client of [user,ed,view,stranger,anon])await client.query('SELECT count(*) FROM storage.objects');
  const seen=await names(user,`WHERE bucket_id='${BUCKET}'`);
  assert.ok(!seen.some(n=>n.includes('not-a-uuid')&&true),'malformed company segment is not readable');
 });
 await t.test('only the second segment grants access: a member uuid in the third segment or the first does not',async()=>{
  const decoyThird=await seed(`logos/${B}/${A}`);
  const decoyFirst=await seed(`${A}/${B}/x.png`);
  const seen=await names(user,`WHERE bucket_id='${BUCKET}'`);
  assert.ok(!seen.includes(decoyThird),'a company uuid in the filename slot must not grant access');
  assert.ok(!seen.includes(decoyFirst),'a company uuid in the kind slot must not grant access');
 });
});

test('writes need an owner or editor of the company in the path',async t=>{
 await bucketReady();
 const user=await connect('authenticated',owner),ed=await connect('authenticated',editor),view=await connect('authenticated',viewer),stranger=await connect('authenticated',outsider),other=await connect('authenticated',rival),anon=await connect('anon');
 await t.test('owner and editor can add objects for their company; viewer, outsider and anon cannot',async()=>{
  await insertObject(user,file('logos',A));
  await insertObject(ed,file('portraits',A));
  await insertObject(ed,file('offering-images',A));
  await rejected(insertObject(view,file('logos',A)),'a viewer must not write');
  await rejected(insertObject(stranger,file('logos',A)),'a non-member must not write');
  await rejected(insertObject(anon,file('logos',A)),'anon must not write');
 });
 await t.test('no one writes into another company folder, malformed paths, or a decoy company slot',async()=>{
  await rejected(insertObject(ed,file('logos',B)),'editor of A writing company B');
  await rejected(insertObject(user,file('logos',B)),'owner of A writing company B');
  await rejected(insertObject(other,file('logos',A)),'owner of B writing company A');
  await rejected(insertObject(ed,`logos/not-a-uuid/${randomUUID()}.png`),'non-uuid company segment');
  await rejected(insertObject(ed,`logos/${B}/${A}`),'member uuid only in the third segment');
  await rejected(insertObject(ed,`logos`),'a one-segment path');
 });
 await t.test('delete is limited to owner and editor of the same company and removes exactly the row',async()=>{
  const victim=await seed(file('logos',A)),foreign=await seed(file('logos',B));
  assert.equal((await view.query('DELETE FROM storage.objects WHERE name=$1',[victim])).rowCount,0,'viewer delete must affect nothing');
  assert.equal((await stranger.query('DELETE FROM storage.objects WHERE name=$1',[victim])).rowCount,0,'outsider delete must affect nothing');
  assert.equal((await anon.query('DELETE FROM storage.objects WHERE name=$1',[victim])).rowCount,0,'anon delete must affect nothing');
  assert.equal((await ed.query('DELETE FROM storage.objects WHERE name=$1',[foreign])).rowCount,0,'editor of A must not delete B');
  assert.equal((await ed.query('DELETE FROM storage.objects WHERE name=$1',[victim])).rowCount,1,'editor of the company may delete');
  assert.equal((await user.query('DELETE FROM storage.objects WHERE name=$1',[foreign])).rowCount,0);
  assert.equal((await admin.query('SELECT 1 FROM storage.objects WHERE name=$1',[foreign])).rowCount,1,'B\'s object is untouched');
  const second=await seed(file('portraits',A));
  assert.equal((await user.query('DELETE FROM storage.objects WHERE name=$1',[second])).rowCount,1,'owner may delete');
 });
 await t.test('overwrite and rename are limited the same way: viewer and outsider cannot update, and cannot move an object to another company',async()=>{
  const target=await seed(file('logos',A));
  assert.equal((await view.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1",[target])).rowCount,0);
  assert.equal((await stranger.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1",[target])).rowCount,0);
  assert.equal((await anon.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1",[target])).rowCount,0);
  await rejected(ed.query('UPDATE storage.objects SET name=$1 WHERE name=$2',[file('logos',B),target]).then(r=>{if(r.rowCount===0)throw new Error('no row updated');}),'an editor of A must not move an object into company B');
  assert.equal((await admin.query('SELECT 1 FROM storage.objects WHERE name=$1',[target])).rowCount,1);
 });
});

test('revoking membership or archiving the company takes effect immediately',async t=>{
 await bucketReady();
 const ed=await connect('authenticated',editor),gone=await connect('authenticated',removed),user=await connect('authenticated',owner),view=await connect('authenticated',viewer);
 await t.test('removing a member ends their read and write access to the company folder',async()=>{
  const name=await seed(file('logos',A));
  assert.ok((await names(gone,`WHERE bucket_id='${BUCKET}'`)).includes(name));
  await insertObject(gone,file('logos',A));
  await call(user,'public.set_company_member',[A,removed,null]);
  assert.ok(!(await names(gone,`WHERE bucket_id='${BUCKET}'`)).includes(name),'a removed member must lose read access');
  await rejected(insertObject(gone,file('logos',A)),'a removed member must lose write access');
  assert.equal((await gone.query('DELETE FROM storage.objects WHERE name=$1',[name])).rowCount,0);
 });
 await t.test('an archived company stays readable by members but refuses new objects and deletes',async()=>{
  const existing=await seed(file('logos',C));
  await insertObject(user,file('logos',C));
  const generation=(await admin.query('SELECT draft_generation FROM public.companies WHERE id=$1',[C])).rows[0].draft_generation;
  await call(user,'public.archive_company',[C,generation]);
  assert.ok((await admin.query('SELECT archived_at FROM public.companies WHERE id=$1',[C])).rows[0].archived_at);
  for(const client of [user,ed,view])assert.ok((await names(client,`WHERE bucket_id='${BUCKET}'`)).includes(existing),'archived company objects stay readable');
  await rejected(insertObject(user,file('logos',C)),'owner must not add to an archived company');
  await rejected(insertObject(ed,file('portraits',C)),'editor must not add to an archived company');
  assert.equal((await user.query('DELETE FROM storage.objects WHERE name=$1',[existing])).rowCount,0,'owner must not delete from an archived company');
  assert.equal((await ed.query('DELETE FROM storage.objects WHERE name=$1',[existing])).rowCount,0,'editor must not delete from an archived company');
 });
});

test('the optional uploads metadata table, if the design adds one, is tenant-isolated',async t=>{
 const exists=(await admin.query("SELECT to_regclass('public.uploads') AS t")).rows[0].t;
 if(!exists){t.diagnostic('design keeps no public.uploads table; metadata lives in storage.objects');return;}
 const user=await connect('authenticated',owner),view=await connect('authenticated',viewer),stranger=await connect('authenticated',outsider),other=await connect('authenticated',rival),anon=await connect('anon');
 await t.test('columns include id, company_id, kind, path, content_type, size_bytes, created_by, created_at',async()=>{
  const cols=(await admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='uploads'")).rows.map(r=>r.column_name);
  for(const c of ['id','company_id','kind','path','content_type','size_bytes','created_by','created_at'])assert.ok(cols.includes(c),`uploads.${c} must exist`);
 });
 await t.test('row level security is on and rows follow company membership',async()=>{
  assert.equal((await admin.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.uploads'::regclass")).rows[0].relrowsecurity,true);
  const id=randomUUID(),path=file('logos',A);
  await admin.query("INSERT INTO public.uploads(id,company_id,kind,path,content_type,size_bytes,created_by) VALUES($1,$2,'logos',$3,'image/png',68,$4)",[id,A,path,owner]);
  for(const client of [user,view])assert.equal((await client.query('SELECT id FROM public.uploads WHERE id=$1',[id])).rowCount,1,'members read');
  for(const client of [stranger,other])assert.equal((await client.query('SELECT id FROM public.uploads WHERE id=$1',[id])).rowCount,0,'non-members read nothing');
  const anonRead=await anon.query('SELECT id FROM public.uploads').then(r=>r.rowCount,()=>0);
  assert.equal(anonRead,0,'anon reads nothing');
 });
 await t.test('viewers, outsiders and anon cannot insert metadata rows',async()=>{
  const insert=(client,company)=>client.query("INSERT INTO public.uploads(id,company_id,kind,path,content_type,size_bytes,created_by) VALUES($1,$2,'logos',$3,'image/png',1,auth.uid())",[randomUUID(),company,file('logos',company)]);
  await rejected(insert(view,A),'viewer');
  await rejected(insert(stranger,A),'outsider');
  await rejected(insert(anon,A),'anon');
 });
});
