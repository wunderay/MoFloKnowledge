-- Extend candidate cache metadata without rewriting the frozen 0004 contract.
BEGIN;
SET ROLE moflo_owner;
ALTER FUNCTION private.contract_schema(text) RENAME TO contract_schema_before_candidate_priority;
CREATE FUNCTION private.contract_schema(p_kind text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_kind='worker_checkpoint' THEN
  jsonb_set(private.contract_schema_before_candidate_priority(p_kind),
   '{properties,validated_candidates,items,properties,priority}',
   '{"type":"integer","minimum":0,"maximum":100}'::jsonb)
 ELSE private.contract_schema_before_candidate_priority(p_kind) END
$$;
COMMIT;
