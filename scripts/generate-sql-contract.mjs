import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]??'.');
const read=async name=>JSON.parse(await readFile(resolve(root,'src/contracts',name),'utf8'));
const [schemas,defaults,fields]=await Promise.all([read('json-schemas.json'),read('defaults.json'),read('field-registry.json')]);
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const sql=`-- Generated from src/contracts/{json-schemas,defaults,field-registry}.json. Do not edit.\nBEGIN;\nSET ROLE moflo_owner;\nCREATE FUNCTION private.contract_schema(p_kind text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(schemas)}->p_kind $fn$;\nCREATE FUNCTION private.business_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(defaults)} $fn$;\nCREATE FUNCTION private.field_registry() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT ${literal(fields)} $fn$;\nCOMMIT;\n`;
await writeFile(new URL('../supabase/migrations/0004_contract.generated.sql',import.meta.url),sql);
