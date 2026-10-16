BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.assert_proposals(p_company uuid,p_author uuid,p_proposals jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate jsonb; r public.knowledge_entry_versions; ids text[]:='{}';
BEGIN
 IF jsonb_typeof(p_proposals)<>'object' OR jsonb_typeof(p_proposals->'candidates')<>'array' OR jsonb_array_length(p_proposals->'candidates')>100 OR octet_length(p_proposals::text)>4194304 THEN RAISE EXCEPTION 'invalid_proposals'; END IF;
 FOR candidate IN SELECT value FROM jsonb_array_elements(p_proposals->'candidates') LOOP
  IF candidate->>'id' IS NULL OR candidate->>'id'=ANY(ids) THEN RAISE EXCEPTION 'duplicate_proposal_id'; END IF; ids:=ids||(candidate->>'id');
  IF candidate->>'schema_version'<>'1.0.0' THEN RAISE EXCEPTION 'unsupported_schema'; END IF;
  IF candidate->>'target_entry_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public.knowledge_entries WHERE company_id=p_company AND id=(candidate->>'target_entry_id')::uuid) THEN RAISE EXCEPTION 'unavailable_entry'; END IF;
  r.company_id:=p_company; r.author_id:=p_author; r.content:=candidate->'content'; r.provenance:=candidate->'provenance'; r.entry_id:=coalesce((candidate->>'target_entry_id')::uuid,(r.provenance->'claims'->0->>'entry_id')::uuid,(r.content->>'id')::uuid,gen_random_uuid());
  PERFORM private.assert_revision(r,candidate->>'kind');
 END LOOP;
END $$;
CREATE FUNCTION private.validate_finalized_proposals() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.proposals IS DISTINCT FROM OLD.proposals AND NEW.proposals ? 'candidates' THEN
  PERFORM private.assert_proposals(NEW.company_id,NEW.requested_by,NEW.proposals);
  IF OLD.proposals ? 'candidates' AND (NEW.proposals-'decisions') IS DISTINCT FROM (OLD.proposals-'decisions') THEN RAISE EXCEPTION 'immutable_candidates'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finalized_proposals BEFORE UPDATE ON public.scrape_jobs FOR EACH ROW EXECUTE FUNCTION private.validate_finalized_proposals();
CREATE FUNCTION private.finish_job(p_job uuid,p_company uuid,p_lease_token uuid,p_proposals jsonb,p_coverage jsonb) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs:=private.worker_job(p_job,p_company,p_lease_token,true); candidate jsonb; e uuid; r public.knowledge_entry_versions; proposals jsonb; status text; first_import boolean;
BEGIN
 IF j.cancel_requested_at IS NOT NULL THEN
  UPDATE public.scrape_jobs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
 END IF;
 IF j.status<>'extracting' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 proposals:=jsonb_set(p_proposals,'{coverage}',p_coverage);
 IF jsonb_typeof(p_coverage)<>'array' THEN RAISE EXCEPTION 'invalid_coverage'; END IF;
 PERFORM private.assert_proposals(p_company,j.requested_by,proposals);
 first_import:=NOT EXISTS(SELECT FROM public.knowledge_entries WHERE company_id=p_company);
 IF first_import THEN
  FOR candidate IN SELECT value FROM jsonb_array_elements(proposals->'candidates') LOOP
   e:=coalesce((candidate->'provenance'->'claims'->0->>'entry_id')::uuid,(candidate->'content'->>'id')::uuid,gen_random_uuid());
   INSERT INTO public.knowledge_entries(id,company_id,kind,created_by) VALUES(e,p_company,candidate->>'kind',j.requested_by);
   INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES(p_company,e,1,candidate->'content',candidate->'provenance',j.requested_by);
  END LOOP;
  IF jsonb_array_length(proposals->'candidates')>0 THEN UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company; END IF;
 END IF;
 status:=CASE WHEN jsonb_array_length(proposals->'candidates')=0 THEN 'failed' WHEN jsonb_array_length(j.errors)>0 OR EXISTS(SELECT FROM jsonb_array_elements(p_coverage) c WHERE c->>'status' IN ('partial','conflict','not_checked')) THEN 'partial' ELSE 'succeeded' END;
 UPDATE public.scrape_jobs SET status=finish_job.status,proposals=finish_job.proposals,finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
END $$;
CREATE FUNCTION private.fail_job(p_job uuid,p_company uuid,p_lease_token uuid,p_error jsonb) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs:=private.worker_job(p_job,p_company,p_lease_token,true); safe jsonb;
BEGIN
 IF jsonb_typeof(p_error)<>'object' OR p_error-ARRAY['code','url','retryable','message']<>'{}' OR length(coalesce(p_error->>'code','')) NOT BETWEEN 1 AND 100 OR length(coalesce(p_error->>'message','')) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p_error->'retryable')<>'boolean' THEN RAISE EXCEPTION 'invalid_safe_error'; END IF;
 safe:=jsonb_build_object('code',p_error->>'code','url',p_error->'url','retryable',p_error->'retryable','message',p_error->>'message');
 UPDATE public.scrape_jobs SET status=CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE 'failed' END,errors=errors||jsonb_build_array(safe),finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
END $$;
CREATE FUNCTION public.dismiss_proposal(p_company uuid,p_job uuid,p_proposal uuid,p_reason text DEFAULT NULL) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs; decision jsonb;
BEGIN
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 IF j.id IS NULL OR NOT EXISTS(SELECT FROM jsonb_array_elements(j.proposals->'candidates') p WHERE p->>'id'=p_proposal::text) THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF length(p_reason)>2000 THEN RAISE EXCEPTION 'invalid_reason'; END IF;
 decision:=jsonb_build_object('proposal_id',p_proposal,'action','dismiss','actor_id',auth.uid(),'at',now(),'reason',p_reason);
 UPDATE public.scrape_jobs SET proposals=jsonb_set(proposals,'{decisions}',coalesce(proposals->'decisions','[]')||jsonb_build_array(decision)),updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
END $$;
CREATE FUNCTION public.apply_proposal(p_company uuid,p_job uuid,p_proposal uuid,p_entry uuid,p_expected_revision integer,p_selected_candidate_ids jsonb,p_request uuid) RETURNS public.knowledge_entry_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs; candidate jsonb; r public.knowledge_entry_versions; e public.knowledge_entries; h text:=private.operation_hash(jsonb_build_array('apply',p_job,p_proposal,p_entry,p_expected_revision,p_selected_candidate_ids));
BEGIN
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 SELECT value INTO candidate FROM jsonb_array_elements(j.proposals->'candidates') WHERE value->>'id'=p_proposal::text;
 IF candidate IS NULL OR j.status NOT IN ('succeeded','partial') THEN RAISE EXCEPTION 'unavailable'; END IF;
 -- A proposal is a typed complete candidate. Unresolved field conflicts require an explicit corrected revision.
 IF jsonb_array_length(coalesce(candidate->'conflicts','[]'))>0 THEN RAISE EXCEPTION 'unresolved_conflicts'; END IF;
 IF jsonb_typeof(p_selected_candidate_ids)<>'array' OR p_selected_candidate_ids<>jsonb_build_array(p_proposal) THEN RAISE EXCEPTION 'invalid_candidate_selection'; END IF;
 IF p_entry IS NULL THEN
  e.id:=coalesce((candidate->'provenance'->'claims'->0->>'entry_id')::uuid,(candidate->'content'->>'id')::uuid,gen_random_uuid()); e.current_revision:=0;
  INSERT INTO public.knowledge_entries(id,company_id,kind,created_by) VALUES(e.id,p_company,candidate->>'kind',auth.uid());
 ELSE
  SELECT * INTO e FROM public.knowledge_entries WHERE company_id=p_company AND id=p_entry;
  IF e.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
  IF e.current_revision<>p_expected_revision THEN RAISE EXCEPTION 'stale_revision' USING DETAIL=jsonb_build_object('currentRevision',e.current_revision)::text; END IF;
  IF e.kind<>candidate->>'kind' OR candidate->>'target_entry_id' IS NOT NULL AND candidate->>'target_entry_id'<>e.id::text THEN RAISE EXCEPTION 'proposal_target_mismatch'; END IF;
 END IF;
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES(p_company,e.id,e.current_revision+1,candidate->'content',private.operation_provenance(candidate->'provenance',p_request,e.id,'apply_proposal',h),auth.uid()) RETURNING * INTO r;
 UPDATE public.knowledge_entries SET current_revision=r.revision WHERE company_id=p_company AND id=e.id;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company;
 UPDATE public.scrape_jobs SET proposals=jsonb_set(proposals,'{decisions}',coalesce(proposals->'decisions','[]')||jsonb_build_array(jsonb_build_object('proposal_id',p_proposal,'action','apply','actor_id',auth.uid(),'at',now(),'revision_id',r.id))),updated_at=now() WHERE id=p_job; RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION private.finish_job(uuid,uuid,uuid,jsonb,jsonb),private.fail_job(uuid,uuid,uuid,jsonb) TO moflo_worker;
GRANT EXECUTE ON FUNCTION public.dismiss_proposal(uuid,uuid,uuid,text),public.apply_proposal(uuid,uuid,uuid,uuid,integer,jsonb,uuid) TO authenticated;
COMMIT;
