import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.argv.slice(2).find(value=>value!=='--check')??'.');
const read=async name=>JSON.parse(await readFile(resolve(root,'src/contracts',name),'utf8'));
const [schemas,defaults,fields]=await Promise.all([read('json-schemas.json'),read('defaults.json'),read('field-registry.json')]);
Object.assign(schemas,JSON.parse(await readFile(new URL('../supabase/generated/worker-checkpoint.schema.json',import.meta.url),'utf8')));
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const sql=`-- Generated from src/contracts/{json-schemas,defaults,field-registry}.json. Do not edit.\nBEGIN;\nSET ROLE moflo_owner;\nCREATE FUNCTION private.contract_schema(p_kind text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(schemas)}->p_kind $fn$;\nCREATE FUNCTION private.business_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(defaults)} $fn$;\nCREATE FUNCTION private.field_registry() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(fields)} $fn$;\nCOMMIT;\n`;
const output=new URL('../supabase/migrations/0004_contract.generated.sql',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==sql)throw new Error('Generated SQL contract is stale; run scripts/generate-sql-contract.mjs');}
else await writeFile(output,sql);
