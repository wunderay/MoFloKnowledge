-- Accept a pronoun-derived gender when a cited excerpt names the person and uses only that gender's third-person pronouns.
BEGIN;
SET ROLE moflo_owner;
CREATE OR REPLACE FUNCTION private.assert_revision(p_revision public.knowledge_entry_versions,p_kind text DEFAULT NULL,p_supporting_claims jsonb DEFAULT '[]') RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text; root text; business jsonb; c jsonb; target text; leaf text; ids text[]; expected text; field jsonb; conflict jsonb; decision jsonb; selected jsonb; resolved jsonb; valid_targets text[]:='{}'; option_value jsonb; prior public.knowledge_entry_versions;
BEGIN
 SELECT coalesce(p_kind,(SELECT kind FROM public.knowledge_entries WHERE company_id=p_revision.company_id AND id=p_revision.entry_id)) INTO k;
 IF k IS NULL OR private.contract_schema(k) IS NULL THEN RAISE EXCEPTION 'invalid_entry_kind'; END IF;
 PERFORM private.validate_json(p_revision.content,private.contract_schema(k));
 PERFORM private.validate_json(p_revision.provenance,private.contract_schema('provenance'));
 PERFORM private.validate_domain(k,p_revision.content);
 PERFORM private.validate_evidence(p_revision.company_id,p_revision.provenance);
 root:='/'||private.kind_root(k); business:=private.entry_business(k,p_revision.content);
 IF k IN ('key_person','offering') THEN
  IF p_revision.content->>'id'<>p_revision.entry_id::text THEN RAISE EXCEPTION 'entry_id_mismatch'; END IF;
  root:=root||'/@'||p_revision.entry_id::text;
 END IF;
 IF (SELECT count(*) FROM (SELECT value->>'id' id FROM jsonb_array_elements(p_revision.provenance->'sources') UNION ALL SELECT value->>'id' FROM jsonb_array_elements(p_revision.provenance->'evidence') UNION ALL SELECT value->>'id' FROM jsonb_array_elements(p_revision.provenance->'claims')) q)<>(SELECT count(DISTINCT id) FROM (SELECT value->>'id' id FROM jsonb_array_elements(p_revision.provenance->'sources') UNION ALL SELECT value->>'id' FROM jsonb_array_elements(p_revision.provenance->'evidence') UNION ALL SELECT value->>'id' FROM jsonb_array_elements(p_revision.provenance->'claims')) q) THEN RAISE EXCEPTION 'duplicate_provenance_id'; END IF;
 FOREACH target IN ARRAY ARRAY['sources','evidence','claims'] LOOP
  SELECT array_agg(value->>'id') INTO ids FROM jsonb_array_elements(p_revision.provenance->target);
  IF cardinality(ids)<>(SELECT count(DISTINCT a) FROM unnest(ids) a) THEN RAISE EXCEPTION 'duplicate_provenance_id'; END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(p_revision.provenance->'claims') LOOP
  IF EXISTS(SELECT FROM public.knowledge_entry_versions h,jsonb_array_elements(h.provenance->'claims') hc WHERE h.company_id=p_revision.company_id AND hc->>'id'=c->>'id' AND ((hc-'targets')<>(c-'targets') OR NOT (hc->'targets') @> (c->'targets'))) THEN RAISE EXCEPTION 'claim_identity_conflict'; END IF;
  IF c->>'entry_id'<>p_revision.entry_id::text THEN RAISE EXCEPTION 'claim_entry_mismatch'; END IF;
  FOR target IN SELECT jsonb_array_elements_text(c->'targets') LOOP
   IF left(target,length(root)+1)<>root||'/' THEN RAISE EXCEPTION 'claim_target_mismatch'; END IF;
   resolved:=private.resolve_pointer(business,target);
   IF jsonb_typeof(resolved) IN ('object','array') OR target ~ '/id$' THEN RAISE EXCEPTION 'claim_target_not_leaf'; END IF;
   IF NOT private.allowed_origin(target,c->>'origin') THEN RAISE EXCEPTION 'origin_disallowed:%',target; END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(p_revision.provenance->'claims') claim_row, jsonb_array_elements_text(claim_row->'targets') claim_target WHERE claim_target=target)<>1 THEN RAISE EXCEPTION 'ambiguous_claim'; END IF;
   IF target='/positioning/founding_story' AND c->>'origin'='source_backed' AND NOT EXISTS(SELECT FROM jsonb_array_elements(p_revision.provenance->'evidence') evidence_row WHERE c->'evidence_ids' ? (evidence_row->>'id') AND coalesce(evidence_row->>'excerpt','') !~* '^\s*(founded\s*(in\s*)?)?[0-9]{4}[.!]?\s*$') THEN RAISE EXCEPTION 'founding_story_requires_narrative'; END IF;
   IF target ~ '/suppliers_and_partners/.+/relationship_(type|text)$' AND c->>'origin'<>'user_provided' AND NOT EXISTS(SELECT FROM jsonb_array_elements(p_revision.provenance->'evidence') evidence_row WHERE c->'evidence_ids' ? (evidence_row->>'id') AND evidence_row->>'excerpt' IS NOT NULL) THEN RAISE EXCEPTION 'relationship_requires_text'; END IF;
  END LOOP;
  IF c->>'origin'='user_provided' THEN
   IF jsonb_array_length(c->'evidence_ids')<>0 THEN RAISE EXCEPTION 'user_claim_inherits_evidence'; END IF;
   IF c->>'actor_id' IS NULL OR c->>'authored_at' IS NULL OR length(btrim(coalesce(c->>'note','')))=0 THEN RAISE EXCEPTION 'user_claim_attribution_required'; END IF;
   -- A retained historical claim may retain its original author; newly authored claims use auth.uid or stored requester.
   IF c->>'actor_id'<>p_revision.author_id::text AND NOT EXISTS(SELECT FROM public.knowledge_entry_versions h, jsonb_array_elements(h.provenance->'claims') hc WHERE h.company_id=p_revision.company_id AND h.entry_id=p_revision.entry_id AND h.revision<p_revision.revision AND (hc-'targets')=(c-'targets') AND (hc->'targets') @> (c->'targets')) THEN RAISE EXCEPTION 'claim_actor_mismatch'; END IF;
  ELSIF jsonb_array_length(c->'evidence_ids')=0 THEN RAISE EXCEPTION 'claim_evidence_required'; END IF;
  IF c->>'origin'='generated' AND jsonb_array_length(c->'based_on_claim_ids')=0 THEN RAISE EXCEPTION 'generated_claim_support_required'; END IF;
  IF c->>'origin'='source_backed' AND jsonb_array_length(c->'evidence_ids')=0 THEN RAISE EXCEPTION 'source_claim_evidence_required'; END IF;
  FOR target IN SELECT jsonb_array_elements_text(c->'evidence_ids') LOOP
   IF NOT EXISTS(SELECT FROM jsonb_array_elements(p_revision.provenance->'evidence') e WHERE e->>'id'=target) THEN RAISE EXCEPTION 'unknown_evidence'; END IF;
  END LOOP;
  FOR target IN SELECT jsonb_array_elements_text(c->'based_on_claim_ids') LOOP
   IF target=c->>'id' OR NOT EXISTS(SELECT FROM jsonb_array_elements((p_revision.provenance->'claims')||p_supporting_claims) b WHERE b->>'id'=target) AND NOT EXISTS(SELECT FROM public.knowledge_entry_versions h,jsonb_array_elements(h.provenance->'claims') b WHERE h.company_id=p_revision.company_id AND b->>'id'=target) THEN RAISE EXCEPTION 'unknown_supporting_claim'; END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(WITH RECURSIVE edges AS (SELECT claim_row->>'id' a,jsonb_array_elements_text(claim_row->'based_on_claim_ids') b FROM jsonb_array_elements((p_revision.provenance->'claims')||p_supporting_claims) claim_row), walk(a,b) AS (SELECT a,b FROM edges UNION SELECT w.a,e.b FROM walk w JOIN edges e ON e.a=w.b) SELECT FROM walk WHERE a=b) THEN RAISE EXCEPTION 'claim_cycle'; END IF;
 FOR leaf IN SELECT * FROM private.business_leaves(p_revision.content,root) LOOP
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(p_revision.provenance->'claims') cl WHERE cl->'targets' ? leaf) THEN RAISE EXCEPTION 'unclaimed_leaf:%',leaf; END IF;
 END LOOP;
 FOR field IN SELECT value FROM jsonb_array_elements(private.field_registry()) WHERE value->>'kind'=k LOOP
  expected:=replace(field->>'path','@id','@'||p_revision.entry_id::text); valid_targets:=array_append(valid_targets,expected);
  IF (SELECT count(*) FROM jsonb_array_elements(p_revision.provenance->'coverage') cv WHERE cv->'targets' ? expected)<>1 THEN RAISE EXCEPTION 'coverage_required:%',expected; END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(p_revision.provenance->'coverage') LOOP
  IF c->>'job_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public.scrape_jobs WHERE company_id=p_revision.company_id AND id=(c->>'job_id')::uuid) THEN RAISE EXCEPTION 'unavailable_job'; END IF;
  IF c->>'status'<>'found' AND length(btrim(coalesce(c->>'reason','')))=0 THEN RAISE EXCEPTION 'coverage_reason_required'; END IF;
  FOR target IN SELECT jsonb_array_elements_text(c->'targets') LOOP IF NOT target=ANY(valid_targets) THEN RAISE EXCEPTION 'unknown_coverage_target'; END IF; END LOOP;
 END LOOP;
 IF k='key_person' AND p_revision.content->>'gender' IS NOT NULL AND NOT EXISTS(
  SELECT FROM jsonb_array_elements(p_revision.provenance->'claims') gender_claim
  WHERE gender_claim->'targets' ? (root||'/gender') AND (
   gender_claim->>'origin'='user_provided' AND coalesce(gender_claim->>'note','') ~* 'self.description|self.identif|attest'
   OR gender_claim->>'origin'='source_backed' AND EXISTS(
    SELECT FROM jsonb_array_elements(p_revision.provenance->'evidence') gender_evidence
    WHERE gender_claim->'evidence_ids' ? (gender_evidence->>'id') AND gender_evidence->>'kind'='text'
     AND coalesce(gender_evidence->>'excerpt','') ~* 'self[- ]descri|self[- ]identif|I (identify|describe myself) as|gender[[:space:]]*:'
     AND position(lower(p_revision.content->>'gender') IN lower(coalesce(gender_evidence->>'excerpt','')))>0
   )
   OR gender_claim->>'origin'='source_backed' AND gender_claim->>'note'='Third-person pronouns in the person''s own bio.' AND EXISTS(
    SELECT FROM jsonb_array_elements(p_revision.provenance->'evidence') gender_evidence
    WHERE gender_claim->'evidence_ids' ? (gender_evidence->>'id') AND gender_evidence->>'kind'='text'
     AND position(p_revision.content->>'name' IN coalesce(gender_evidence->>'excerpt',''))>0
     AND CASE p_revision.content->>'gender'
      WHEN 'Female' THEN gender_evidence->>'excerpt' ~* '\y(she|her|hers|herself)\y' AND gender_evidence->>'excerpt' !~* '\y(he|him|his|himself)\y'
      WHEN 'Male' THEN gender_evidence->>'excerpt' ~* '\y(he|him|his|himself)\y' AND gender_evidence->>'excerpt' !~* '\y(she|her|hers|herself)\y'
      ELSE false END
   )
  )
 ) THEN RAISE EXCEPTION 'gender_self_description_required'; END IF;
 SELECT * INTO prior FROM public.knowledge_entry_versions WHERE company_id=p_revision.company_id AND entry_id=p_revision.entry_id AND revision<p_revision.revision ORDER BY revision DESC LIMIT 1;
 FOR conflict IN SELECT value FROM jsonb_array_elements(coalesce(prior.provenance->'conflicts','[]')) LOOP
  IF (conflict->>'material')::boolean AND NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(prior.provenance->'decisions','[]')) d WHERE d->>'conflict_id'=conflict->>'id') AND NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_revision.provenance->'conflicts','[]')) current_conflict WHERE current_conflict=conflict) THEN RAISE EXCEPTION 'conflict_history_must_be_retained'; END IF;
 END LOOP;
 FOR conflict IN SELECT value FROM jsonb_array_elements(coalesce(p_revision.provenance->'conflicts','[]')) LOOP
  IF EXISTS(SELECT FROM jsonb_array_elements(coalesce(prior.provenance->'conflicts','[]')) cf WHERE cf->>'id'=conflict->>'id' AND cf<>conflict) THEN RAISE EXCEPTION 'immutable_conflict_candidates'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p_revision.provenance->'conflicts','[]')) cf WHERE cf->>'id'=conflict->>'id')<>1 THEN RAISE EXCEPTION 'duplicate_conflict_id'; END IF;
  FOR option_value IN SELECT value FROM jsonb_array_elements(conflict->'candidates') LOOP
   PERFORM private.validate_json(option_value->'value',private.target_schema(k,conflict->>'target'));
   FOR target IN SELECT jsonb_array_elements_text(option_value->'evidence_ids') LOOP
    IF NOT EXISTS(SELECT FROM jsonb_array_elements(p_revision.provenance->'evidence') e WHERE e->>'id'=target) THEN RAISE EXCEPTION 'unknown_candidate_evidence'; END IF;
   END LOOP;
   FOR leaf IN SELECT * FROM private.business_leaves(option_value->'value',conflict->>'target') LOOP
    IF NOT private.allowed_origin(leaf,option_value->>'origin') THEN RAISE EXCEPTION 'candidate_origin_disallowed'; END IF;
   END LOOP;
   FOR target IN SELECT jsonb_array_elements_text(option_value->'based_on_claim_ids') LOOP
    IF NOT EXISTS(SELECT FROM jsonb_array_elements((p_revision.provenance->'claims')||p_supporting_claims) b WHERE b->>'id'=target) AND NOT EXISTS(SELECT FROM public.knowledge_entry_versions h,jsonb_array_elements(h.provenance->'claims') b WHERE h.company_id=p_revision.company_id AND b->>'id'=target) THEN RAISE EXCEPTION 'unknown_candidate_support'; END IF;
   END LOOP;
   IF option_value->>'origin'<>'user_provided' AND jsonb_array_length(option_value->'evidence_ids')=0 THEN RAISE EXCEPTION 'candidate_evidence_required'; END IF;
   IF option_value->>'origin'='generated' AND jsonb_array_length(option_value->'based_on_claim_ids')=0 THEN RAISE EXCEPTION 'generated_candidate_support_required'; END IF;
  END LOOP;
  SELECT value INTO decision FROM jsonb_array_elements(coalesce(p_revision.provenance->'decisions','[]')) d WHERE d->>'conflict_id'=conflict->>'id';
  IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p_revision.provenance->'decisions','[]')) d WHERE d->>'conflict_id'=conflict->>'id')>1 THEN RAISE EXCEPTION 'duplicate_conflict_decision'; END IF;
  IF p_revision.review_status='approved' AND (conflict->>'material')::boolean AND decision IS NULL THEN RAISE EXCEPTION 'unresolved_conflict'; END IF;
  IF decision IS NOT NULL THEN
   IF decision->>'actor_id'<>p_revision.author_id::text AND NOT EXISTS(SELECT FROM public.knowledge_entry_versions h,jsonb_array_elements(coalesce(h.provenance->'decisions','[]')) d WHERE h.company_id=p_revision.company_id AND h.entry_id=p_revision.entry_id AND h.revision<p_revision.revision AND d=decision) THEN RAISE EXCEPTION 'decision_actor_mismatch'; END IF;
   IF decision->>'target'<>conflict->>'target' THEN RAISE EXCEPTION 'conflict_target_mismatch'; END IF;
   resolved:=private.resolve_pointer(business,decision->>'target');
   IF decision->>'action'='select' THEN
    SELECT value INTO selected FROM jsonb_array_elements(conflict->'candidates') x WHERE x->>'id'=decision->>'candidate_id';
    IF selected IS NULL OR resolved IS DISTINCT FROM selected->'value' THEN RAISE EXCEPTION 'conflict_value_mismatch'; END IF;
    FOR leaf IN SELECT * FROM private.business_leaves(selected->'value',decision->>'target') LOOP
     IF NOT EXISTS(SELECT FROM jsonb_array_elements(p_revision.provenance->'claims') claim WHERE claim->'targets' ? leaf AND claim->>'origin'=selected->>'origin' AND claim->'evidence_ids'=selected->'evidence_ids' AND claim->'based_on_claim_ids'=selected->'based_on_claim_ids') THEN RAISE EXCEPTION 'selected_candidate_origin_mismatch'; END IF;
    END LOOP;
   ELSIF decision->>'action'='clear' AND resolved<>'null'::jsonb AND resolved<>'[]'::jsonb THEN RAISE EXCEPTION 'conflict_not_cleared'; END IF;
  END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(p_revision.provenance->'operations') LOOP
  IF c->>'supersedes_claim_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public.knowledge_entry_versions h,jsonb_array_elements(h.provenance->'claims') hc WHERE h.company_id=p_revision.company_id AND h.revision<p_revision.revision AND hc->>'id'=c->>'supersedes_claim_id') THEN RAISE EXCEPTION 'unavailable_historical_claim'; END IF;
 END LOOP;
 FOR decision IN SELECT value FROM jsonb_array_elements(coalesce(p_revision.provenance->'decisions','[]')) LOOP
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_revision.provenance->'conflicts','[]')) x WHERE x->>'id'=decision->>'conflict_id') THEN RAISE EXCEPTION 'unknown_conflict'; END IF;
 END LOOP;
 RETURN;
END $$;
COMMIT;
