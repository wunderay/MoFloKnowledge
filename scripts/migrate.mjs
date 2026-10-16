import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error('DATABASE_URL is required: use a migration administrator, never a renderer credential');
const target=new URL(connectionString);
if(!target.pathname.endsWith('_test')&&!process.argv.includes('--allow-production'))throw new Error('Refusing a non-test database; deployment operators must explicitly pass --allow-production');
const directory=new URL('../supabase/migrations/',import.meta.url);
const files=(await readdir(directory)).filter(x=>x.endsWith('.sql')).sort();
const client=new pg.Client({connectionString});
await client.connect();
try{
 await client.query("SELECT pg_advisory_lock(hashtextextended('moflo:migrations',0))");
 // Supabase's infrastructure schema is separate from the seven public domain tables.
 await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
 await client.query('CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text)');
 for(const file of files){
  const version=file.split('_')[0];const source=await readFile(new URL(file,directory),'utf8');
  const existing=await client.query('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1',[version]);
  if(existing.rowCount){
   if(existing.rows[0].statements?.join('\n')!==source)throw new Error(`Applied migration changed: ${file}`);
   continue;
  }
  await client.query('BEGIN');
  try{
   await client.query(source.split('\n').filter(line=>!['BEGIN;','COMMIT;'].includes(line.trim())).join('\n'));
   await client.query('RESET ROLE');
   await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,file.slice(file.indexOf('_')+1,-4),[source]]);
   await client.query('COMMIT');process.stdout.write(`Applied ${file}\n`);
  }catch(error){await client.query('ROLLBACK');throw error;}
 }
}finally{await client.end();}
