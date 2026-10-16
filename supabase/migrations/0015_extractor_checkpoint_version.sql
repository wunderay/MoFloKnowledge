-- Add an optional deterministic extractor cache version without rewriting the frozen 0004 schema.
BEGIN;
SET ROLE moflo_owner;
ALTER FUNCTION private.contract_schema(text) RENAME TO contract_schema_before_extractor_version;
CREATE FUNCTION private.contract_schema(p_kind text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_kind='worker_checkpoint' THEN
  jsonb_set(private.contract_schema_before_extractor_version(p_kind),'{properties,extractor_version}',
   '{"type":"string","minLength":1,"maxLength":100}'::jsonb)
 ELSE private.contract_schema_before_extractor_version(p_kind) END
$$;
COMMIT;
