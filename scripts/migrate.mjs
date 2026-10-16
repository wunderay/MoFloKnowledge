import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const database=process.env.DATABASE_URL;
if(!database) throw new Error('DATABASE_URL is required; use a migration administrator connection, never a renderer credential');
const directory=new URL('../supabase/migrations/',import.meta.url);
const files=(await readdir(directory)).filter(x=>x.endsWith('.sql')).sort();
// psql is used deliberately: SQL migrations run in their declared transactions with ON_ERROR_STOP.
for(const file of files){
 const result=spawnSync(process.env.PSQL??'psql',[database,'--no-psqlrc','--set','ON_ERROR_STOP=1','--file',fileURLToPath(new URL(file,directory))],{stdio:'inherit'});
 if(result.error) throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
