import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.argv.slice(2).find(value=>value!=='--check')??'.');
const read=async name=>JSON.parse(await readFile(resolve(root,'src/contracts',name),'utf8'));
const [schemas,defaults,fields]=await Promise.all([read('json-schemas.json'),read('defaults.json'),read('field-registry.json')]);
Object.assign(schemas,JSON.parse(await readFile(new URL('../supabase/generated/worker-checkpoint.schema.json',import.meta.url),'utf8')));
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
// Applied migrations are never edited (scripts/migrate.mjs refuses a changed one). 0004 froze the original contract;
// later changes live in the newest migration holding a generated block, which this script rewrites and checks.
// Schemas changed since 0004 are replaced there and every other schema must still equal the frozen 0004 copy.
const changedSinceFrozen=['site_links','export_provenance','export'];
const directory=new URL('../supabase/migrations/',import.meta.url);
const begin='-- BEGIN GENERATED CONTRACT (scripts/generate-sql-contract.mjs; do not edit)\n',end='-- END GENERATED CONTRACT\n';
const block=`${begin}ALTER FUNCTION private.contract_schema(text) RENAME TO contract_schema_before_site_links;\nCREATE FUNCTION private.contract_schema(p_kind text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT coalesce(${literal(Object.fromEntries(changedSinceFrozen.map(key=>[key,schemas[key]])))}->p_kind,private.contract_schema_before_site_links(p_kind)) $fn$;\nCREATE OR REPLACE FUNCTION private.business_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(defaults)} $fn$;\nCREATE OR REPLACE FUNCTION private.field_registry() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(fields)} $fn$;\n${end}`;
const files=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
const holders=[];for(const name of files)if((await readFile(new URL(name,directory),'utf8')).includes(begin))holders.push(name);
const holder=holders.at(-1);
if(!holder)throw new Error('No migration has the generated contract markers');
const target=new URL(holder,directory);
const source=await readFile(target,'utf8');
const start=source.indexOf(begin),stop=source.indexOf(end);
if(stop<start)throw new Error(`${holder} has unbalanced generated contract markers`);
const current=source.slice(start,stop+end.length);
const frozen=(await readFile(new URL('0004_contract.generated.sql',directory),'utf8')).match(/SELECT '(.*)'::jsonb->p_kind/)?.[1];
const original=JSON.parse(frozen.replaceAll("''","'"));
const unchanged=Object.keys(schemas).filter(key=>!changedSinceFrozen.includes(key));
if(process.argv.includes('--check')){
 if(current!==block)throw new Error('Generated SQL contract is stale; run scripts/generate-sql-contract.mjs');
 const missing=changedSinceFrozen.filter(key=>!(key in schemas));
 if(missing.length)throw new Error(`Schemas replaced by ${holder} are missing from json-schemas.json: ${missing.join(', ')}`);
 const added=unchanged.filter(key=>!(key in original)),removed=Object.keys(original).filter(key=>!changedSinceFrozen.includes(key)&&!(key in schemas));
 if(added.length||removed.length)throw new Error(`Schema keys differ from the frozen 0004 contract without a migration (added: ${added.join(', ')||'none'}; removed: ${removed.join(', ')||'none'})`);
 const drifted=unchanged.filter(key=>JSON.stringify(schemas[key])!==JSON.stringify(original[key]));
 if(drifted.length)throw new Error(`Schemas changed without a migration (frozen in 0004): ${drifted.join(', ')}`);
}else{
 if(files.at(-1)!==holder)throw new Error(`Refusing to rewrite ${holder}: newer migration ${files.at(-1)} exists; add a marked block to a new migration instead`);
 await writeFile(target,source.slice(0,start)+block+source.slice(stop+end.length));
}
