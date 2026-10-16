-- Preserve immutable history; require a new source-only crawl before applying legacy AI proposals.
BEGIN;
SET ROLE moflo_owner;
CREATE OR REPLACE FUNCTION public.apply_proposal(p_company uuid,p_job uuid,p_proposal uuid,p_entry uuid,p_expected_revision integer,p_selected_candidate_ids jsonb,p_request uuid) RETURNS public.knowledge_entry_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs; candidate jsonb; r public.knowledge_entry_versions; previous public.knowledge_entry_versions; e public.knowledge_entries; h text:=private.operation_hash(jsonb_build_array('apply',p_job,p_proposal,p_entry,p_expected_revision,p_selected_candidate_ids));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 SELECT value INTO candidate FROM jsonb_array_elements(j.proposals->'candidates') WHERE value->>'id'=p_proposal::text;
 IF candidate IS NULL OR j.status NOT IN ('succeeded','partial') THEN RAISE EXCEPTION 'unavailable'; END IF;
 -- Successful historical requests return above; pending AI candidates require a fresh crawl.
 IF coalesce(candidate->>'model','') NOT IN ('','deterministic-only')
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(candidate->'provenance'->'claims','[]')) claim WHERE claim->>'origin' IN ('inferred','generated'))
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(candidate->'conflicts','[]')||coalesce(candidate->'provenance'->'conflicts','[]')) conflict,jsonb_array_elements(coalesce(conflict->'candidates','[]')) option_value WHERE option_value->>'origin' IN ('inferred','generated')) THEN
  RAISE EXCEPTION 'legacy_ai_proposal_requires_recrawl' USING ERRCODE='23514';
 END IF;
 IF p_entry IS NULL THEN
  e.id:=coalesce((candidate->'provenance'->'claims'->0->>'entry_id')::uuid,(candidate->'content'->>'id')::uuid,gen_random_uuid()); e.current_revision:=0; e.kind:=candidate->>'kind';
  INSERT INTO public.knowledge_entries(id,company_id,kind,created_by) VALUES(e.id,p_company,candidate->>'kind',auth.uid());
 ELSE
  SELECT * INTO e FROM public.knowledge_entries WHERE company_id=p_company AND id=p_entry;
  IF e.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
  IF e.current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'stale_revision' USING DETAIL=jsonb_build_object('currentRevision',e.current_revision)::text; END IF;
  IF candidate->>'base_revision' IS NOT NULL AND (candidate->>'base_revision')::integer<>e.current_revision THEN RAISE EXCEPTION 'stale_proposal'; END IF;
  IF e.kind<>candidate->>'kind' OR candidate->>'target_entry_id' IS NOT NULL AND candidate->>'target_entry_id'<>e.id::text THEN RAISE EXCEPTION 'proposal_target_mismatch'; END IF;
 END IF;
 candidate:=private.prepare_proposal(candidate,e.id,p_selected_candidate_ids,auth.uid());
 IF e.current_revision>0 THEN
  SELECT * INTO previous FROM public.knowledge_entry_versions WHERE company_id=p_company AND entry_id=e.id AND revision=e.current_revision;
 ELSE
  previous.company_id:=p_company; previous.entry_id:=e.id; previous.content:=private.entry_defaults(e.kind,e.id); previous.provenance:=private.empty_entry_provenance(e.kind,e.id);
 END IF;
 candidate:=private.merge_saved_proposal(candidate,previous,e.kind);
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES(p_company,e.id,e.current_revision+1,candidate->'content',private.operation_provenance(candidate->'provenance',p_request,e.id,'apply_proposal',h),auth.uid()) RETURNING * INTO r;
 UPDATE public.knowledge_entries SET current_revision=r.revision WHERE company_id=p_company AND id=e.id;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company;
 UPDATE public.scrape_jobs SET proposals=jsonb_set(proposals,'{decisions}',coalesce(proposals->'decisions','[]')||jsonb_build_array(jsonb_build_object('proposal_id',p_proposal,'action','apply','actor_id',auth.uid(),'at',now(),'revision_id',r.id,'selected_candidate_ids',p_selected_candidate_ids))),updated_at=now() WHERE id=p_job; RETURN r;
END $$;
COMMIT;
