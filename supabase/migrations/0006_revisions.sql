BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.kind_root(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_kind WHEN 'key_person' THEN 'key_people' WHEN 'offering' THEN 'offerings' ELSE p_kind END
$$;
CREATE FUNCTION private.entry_business(p_kind text,p_content jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.business_defaults() || jsonb_build_object(private.kind_root(p_kind),CASE WHEN p_kind IN ('key_person','offering') THEN jsonb_build_array(p_content) ELSE p_content END)
$$;
CREATE FUNCTION private.assert_revision(p_revision public.knowledge_entry_versions,p_kind text DEFAULT NULL,p_supporting_claims jsonb DEFAULT '[]') RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
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
 IF k='key_person' AND p_revision.content->>'gender' IS NOT NULL AND NOT EXISTS(SELECT FROM jsonb_array_elements(p_revision.provenance->'claims') cl WHERE cl->'targets' ? (root||'/gender') AND coalesce(cl->>'note','') ~* 'self.description|self.identif|attest') THEN RAISE EXCEPTION 'gender_self_description_required'; END IF;
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
CREATE FUNCTION private.validate_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.assert_revision(NEW); RETURN NEW; END $$;
CREATE CONSTRAINT TRIGGER validate_revision AFTER INSERT ON public.knowledge_entry_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.validate_revision();
CREATE FUNCTION private.idempotency_value(v jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(v)='object' THEN SELECT coalesce(jsonb_object_agg(key,private.idempotency_value(value)),'{}') INTO result FROM jsonb_each(v) WHERE key NOT IN ('authored_at','decided_at');
 ELSIF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(private.idempotency_value(value) ORDER BY ord),'[]') INTO result FROM jsonb_array_elements(v) WITH ORDINALITY q(value,ord);
 ELSE result:=v; END IF; RETURN result;
END $$;
CREATE FUNCTION private.operation_hash(p_body jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT 'sha256:'||encode(public.digest(convert_to(private.canonical_json(private.idempotency_value(p_body)),'UTF8'),'sha256'),'hex')
$$;
CREATE FUNCTION private.prior_operation(p_company uuid,p_request uuid,p_hash text) RETURNS public.knowledge_entry_versions LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.knowledge_entry_versions; op jsonb;
BEGIN
 SELECT v.* INTO r FROM public.knowledge_entry_versions v WHERE v.company_id=p_company AND EXISTS(SELECT FROM jsonb_array_elements(v.provenance->'operations') o WHERE o->>'request_id'=p_request::text AND o->>'note'=p_hash) ORDER BY v.created_at LIMIT 1;
 IF r.id IS NULL AND EXISTS(SELECT FROM public.knowledge_entry_versions v, jsonb_array_elements(v.provenance->'operations') o WHERE v.company_id=p_company AND o->>'request_id'=p_request::text) THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION private.operation_provenance(p_provenance jsonb,p_request uuid,p_entry uuid,p_kind text,p_hash text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op jsonb;
BEGIN
 FOR op IN SELECT value FROM jsonb_array_elements(coalesce(p_provenance->'operations','[]')) LOOP
  IF NOT EXISTS(SELECT FROM public.knowledge_entry_versions v,jsonb_array_elements(v.provenance->'operations') old WHERE v.entry_id=p_entry AND old=op) THEN
   IF op->>'request_id'<>p_request::text OR op->>'entry_id' IS DISTINCT FROM p_entry::text OR op->>'kind'<>'user_correction' OR length(coalesce(op->>'note','')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'untrusted_operation_metadata'; END IF;
   IF op->>'supersedes_claim_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public.knowledge_entry_versions v,jsonb_array_elements(v.provenance->'claims') old WHERE v.entry_id=p_entry AND old->>'id'=op->>'supersedes_claim_id') THEN RAISE EXCEPTION 'unavailable_historical_claim'; END IF;
  END IF;
 END LOOP;
 RETURN jsonb_set(p_provenance,'{operations}',coalesce(p_provenance->'operations','[]')||jsonb_build_array(jsonb_build_object('request_id',p_request,'entry_id',p_entry,'kind',p_kind,'supersedes_claim_id',NULL,'note',p_hash)));
END $$;
CREATE FUNCTION public.create_entry(p_company uuid,p_kind text,p_content jsonb,p_provenance jsonb,p_request uuid) RETURNS public.knowledge_entry_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); e uuid; r public.knowledge_entry_versions; h text:=private.operation_hash(jsonb_build_array('create',p_kind,p_content,p_provenance));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 e:=coalesce((p_provenance->'claims'->0->>'entry_id')::uuid,CASE WHEN p_kind IN ('key_person','offering') THEN (p_content->>'id')::uuid END,gen_random_uuid());
 INSERT INTO public.knowledge_entries(id,company_id,kind,created_by) VALUES(e,p_company,p_kind,auth.uid());
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES(p_company,e,1,p_content,private.operation_provenance(p_provenance,p_request,e,'create_entry',h),auth.uid()) RETURNING * INTO r;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company; RETURN r;
END $$;
CREATE FUNCTION private.assert_edit_origin(p_company uuid,p_entry uuid,p_content jsonb,p_provenance jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old public.knowledge_entry_versions; k text; root text; leaf text; previous jsonb; current_value jsonb; old_business jsonb; new_business jsonb;
BEGIN
 SELECT e.kind INTO k FROM public.knowledge_entries e WHERE e.company_id=p_company AND e.id=p_entry;
 SELECT r.* INTO old FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=p_company AND e.id=p_entry;
 root:='/'||private.kind_root(k); IF k IN ('key_person','offering') THEN root:=root||'/@'||p_entry::text; END IF;
 PERFORM private.validate_json(p_content,private.contract_schema(k));
 old_business:=private.entry_business(k,old.content); new_business:=private.entry_business(k,p_content);
 FOR leaf IN SELECT * FROM private.business_leaves(p_content,root) LOOP
  BEGIN previous:=private.resolve_pointer(old_business,leaf); EXCEPTION WHEN raise_exception THEN previous:=NULL; END;
  current_value:=private.resolve_pointer(new_business,leaf);
  IF previous IS DISTINCT FROM current_value AND NOT EXISTS(SELECT FROM jsonb_array_elements(p_provenance->'claims') claim WHERE claim->'targets' ? leaf AND claim->>'origin'='user_provided' AND claim->>'actor_id'=auth.uid()::text) THEN RAISE EXCEPTION 'edited_leaf_requires_user_origin:%',leaf; END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.save_entry_revision(p_company uuid,p_entry uuid,p_expected_revision integer,p_content jsonb,p_provenance jsonb,p_review_status text,p_reason text,p_request uuid) RETURNS public.knowledge_entry_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); e public.knowledge_entries; r public.knowledge_entry_versions; h text:=private.operation_hash(jsonb_build_array('save',p_entry,p_expected_revision,p_content,p_provenance,p_review_status,p_reason));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO e FROM public.knowledge_entries WHERE company_id=p_company AND id=p_entry;
 IF e.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF e.current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'stale_revision' USING DETAIL=jsonb_build_object('currentRevision',e.current_revision)::text; END IF;
 PERFORM private.assert_edit_origin(p_company,p_entry,p_content,p_provenance);
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,review_status,author_id,change_reason) VALUES(p_company,p_entry,e.current_revision+1,p_content,private.operation_provenance(p_provenance,p_request,p_entry,'save_entry_revision',h),p_review_status,auth.uid(),p_reason) RETURNING * INTO r;
 UPDATE public.knowledge_entries SET current_revision=r.revision WHERE company_id=p_company AND id=p_entry;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company; RETURN r;
END $$;
CREATE FUNCTION public.revert_entry(p_company uuid,p_entry uuid,p_from_revision integer,p_expected_revision integer,p_request uuid) RETURNS public.knowledge_entry_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); old public.knowledge_entry_versions; r public.knowledge_entry_versions; e public.knowledge_entries; h text:=private.operation_hash(jsonb_build_array('revert',p_entry,p_from_revision,p_expected_revision));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO e FROM public.knowledge_entries WHERE company_id=p_company AND id=p_entry;
 SELECT * INTO old FROM public.knowledge_entry_versions WHERE company_id=p_company AND entry_id=p_entry AND revision=p_from_revision;
 IF old.id IS NULL OR e.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF e.current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'stale_revision' USING DETAIL=jsonb_build_object('currentRevision',e.current_revision)::text; END IF;
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id,change_reason) VALUES(p_company,p_entry,e.current_revision+1,old.content,private.operation_provenance(old.provenance,p_request,p_entry,'revert_entry',h),auth.uid(),'reverted_from_revision:'||p_from_revision) RETURNING * INTO r;
 UPDATE public.knowledge_entries SET current_revision=r.revision WHERE company_id=p_company AND id=p_entry;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company; RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.create_entry(uuid,text,jsonb,jsonb,uuid),public.save_entry_revision(uuid,uuid,integer,jsonb,jsonb,text,text,uuid),public.revert_entry(uuid,uuid,integer,integer,uuid) TO authenticated;
COMMIT;
