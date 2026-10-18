-- Provenance origin hardening. A member who calls create_entry or save_entry_revision directly (as PostgREST
-- does) must not be able to label any value as source_backed, inferred or generated. Only the trusted paths (finish_job,
-- apply_proposal, prepare_proposal, merge_saved_proposal, revert_entry) store extracted values; a member's write may carry
-- a non-person-authored claim only when it is exactly the claim that already supported that value in the entry's history
-- (same origin, notes and supporting claims, and the very evidence rows of that earlier revision), or when it selects a
-- candidate stored in the previous revision's conflicts. Conflicts whose candidates are not person-authored are carried
-- over from the previous revision unchanged with the evidence rows they had, never planted. Refusals use SQLSTATE
-- 23514 (check_violation); the API maps these and edited_leaf_requires_user_origin to a 422.
BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.pointer_value(p_business jsonb,p_pointer text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN RETURN private.resolve_pointer(p_business,p_pointer); EXCEPTION WHEN raise_exception THEN RETURN NULL; END $$;
-- True when every evidence row cited by p_ids exists in p_current and is, as a whole row, the row of the same id in p_earlier.
CREATE FUNCTION private.evidence_rows_match(p_ids jsonb,p_current jsonb,p_earlier jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NOT EXISTS(
  SELECT FROM jsonb_array_elements_text(coalesce(p_ids,'[]'::jsonb)) cited(id)
  WHERE NOT EXISTS(
   SELECT FROM jsonb_array_elements(coalesce(p_current->'evidence','[]'::jsonb)) now_row
   JOIN jsonb_array_elements(coalesce(p_earlier->'evidence','[]'::jsonb)) then_row ON then_row=now_row
   WHERE now_row->>'id'=cited.id))
$$;
CREATE FUNCTION private.assert_member_origins(p_company uuid,p_entry uuid,p_kind text,p_content jsonb,p_provenance jsonb,p_previous jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb; conflict jsonb; target text; business jsonb:=private.entry_business(p_kind,p_content); previous jsonb:=coalesce(p_previous,'{}'::jsonb); supported boolean;
BEGIN
 -- Conflicts with candidates that are not person-authored come from an import or proposal: carried unchanged only.
 FOR conflict IN SELECT value FROM jsonb_array_elements(coalesce(p_provenance->'conflicts','[]'::jsonb)) LOOP
  IF EXISTS(SELECT FROM jsonb_array_elements(coalesce(conflict->'candidates','[]'::jsonb)) candidate WHERE candidate->>'origin' IS DISTINCT FROM 'user_provided')
   AND NOT EXISTS(
    SELECT FROM jsonb_array_elements(coalesce(previous->'conflicts','[]'::jsonb)) stored
    WHERE stored=conflict AND private.evidence_rows_match((SELECT coalesce(jsonb_agg(e.value),'[]'::jsonb) FROM jsonb_array_elements(coalesce(conflict->'candidates','[]'::jsonb)) candidate,jsonb_array_elements(coalesce(candidate->'evidence_ids','[]'::jsonb)) e),p_provenance,previous)
   ) THEN RAISE EXCEPTION 'unsupported_candidate_origin:%',conflict->>'target' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(p_provenance->'claims','[]'::jsonb)) LOOP
  CONTINUE WHEN c->>'origin'='user_provided';
  FOR target IN SELECT jsonb_array_elements_text(coalesce(c->'targets','[]'::jsonb)) LOOP
   -- (a) the very claim the entry already had for this value, with the evidence rows that revision had
   supported:=EXISTS(
    SELECT FROM public.knowledge_entry_versions h,jsonb_array_elements(h.provenance->'claims') hc
    WHERE h.company_id=p_company AND h.entry_id=p_entry AND (hc-'id'-'targets')=(c-'id'-'targets') AND hc->'targets' ? target
     AND private.pointer_value(private.entry_business(p_kind,h.content),target) IS NOT DISTINCT FROM private.pointer_value(business,target)
     AND private.evidence_rows_match(c->'evidence_ids',p_provenance,h.provenance));
   -- (b) the selection of a candidate stored in the previous revision's conflicts
   IF NOT supported THEN
    supported:=EXISTS(
     SELECT FROM jsonb_array_elements(coalesce(p_provenance->'decisions','[]'::jsonb)) decision
     JOIN LATERAL jsonb_array_elements(coalesce(previous->'conflicts','[]'::jsonb)) stored ON stored->>'id'=decision->>'conflict_id' AND stored->>'target'=decision->>'target'
     JOIN LATERAL jsonb_array_elements(coalesce(stored->'candidates','[]'::jsonb)) candidate ON candidate->>'id'=decision->>'candidate_id'
     WHERE decision->>'action'='select' AND (target=decision->>'target' OR left(target,length(decision->>'target')+1)=(decision->>'target')||'/')
      AND private.pointer_value(business,decision->>'target')=candidate->'value'
      AND c->>'origin'=candidate->>'origin' AND c->'evidence_ids'=candidate->'evidence_ids' AND c->'based_on_claim_ids'=candidate->'based_on_claim_ids'
      AND private.evidence_rows_match(c->'evidence_ids',p_provenance,previous));
   END IF;
   IF NOT supported THEN RAISE EXCEPTION 'unsupported_origin:%',target USING ERRCODE='23514'; END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.save_entry_revision(p_company uuid,p_entry uuid,p_expected_revision integer,p_content jsonb,p_provenance jsonb,p_review_status text,p_reason text,p_request uuid) RETURNS public.knowledge_entry_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); e public.knowledge_entries; r public.knowledge_entry_versions; h text:=private.operation_hash(jsonb_build_array('save',p_entry,p_expected_revision,p_content,p_provenance,p_review_status,p_reason));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO e FROM public.knowledge_entries WHERE company_id=p_company AND id=p_entry;
 IF e.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF e.current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'stale_revision' USING DETAIL=jsonb_build_object('currentRevision',e.current_revision)::text; END IF;
 PERFORM private.assert_edit_origin(p_company,p_entry,p_content,p_provenance);
 PERFORM private.assert_member_origins(p_company,p_entry,e.kind,p_content,p_provenance,(SELECT v.provenance FROM public.knowledge_entry_versions v WHERE v.company_id=p_company AND v.entry_id=p_entry AND v.revision=e.current_revision));
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,review_status,author_id,change_reason) VALUES(p_company,p_entry,e.current_revision+1,p_content,private.operation_provenance(p_provenance,p_request,p_entry,'save_entry_revision',h),p_review_status,auth.uid(),p_reason) RETURNING * INTO r;
 UPDATE public.knowledge_entries SET current_revision=r.revision WHERE company_id=p_company AND id=p_entry;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company; RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.create_entry(p_company uuid,p_kind text,p_content jsonb,p_provenance jsonb,p_request uuid) RETURNS public.knowledge_entry_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); e uuid; r public.knowledge_entry_versions; h text:=private.operation_hash(jsonb_build_array('create',p_kind,p_content,p_provenance));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 e:=coalesce((p_provenance->'claims'->0->>'entry_id')::uuid,CASE WHEN p_kind IN ('key_person','offering') THEN (p_content->>'id')::uuid END,gen_random_uuid());
 -- A member creates an entry from person-authored values only; imported values come from the worker.
 PERFORM private.assert_member_origins(p_company,e,p_kind,p_content,p_provenance,NULL);
 INSERT INTO public.knowledge_entries(id,company_id,kind,created_by) VALUES(e,p_company,p_kind,auth.uid());
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES(p_company,e,1,p_content,private.operation_provenance(p_provenance,p_request,e,'create_entry',h),auth.uid()) RETURNING * INTO r;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company; RETURN r;
END $$;
COMMIT;
