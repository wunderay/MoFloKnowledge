BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.assert_proposals(p_company uuid,p_author uuid,p_proposals jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate jsonb; r public.knowledge_entry_versions; ids text[]:='{}';
BEGIN
 IF jsonb_typeof(p_proposals)<>'object' OR jsonb_typeof(p_proposals->'candidates')<>'array' OR jsonb_array_length(p_proposals->'candidates')>100 OR octet_length(p_proposals::text)>4194304 THEN RAISE EXCEPTION 'invalid_proposals'; END IF;
 FOR candidate IN SELECT value FROM jsonb_array_elements(p_proposals->'candidates') LOOP
  PERFORM (candidate->>'id')::uuid;
  IF candidate->>'id' IS NULL OR candidate->>'id'=ANY(ids) THEN RAISE EXCEPTION 'duplicate_proposal_id'; END IF; ids:=ids||(candidate->>'id');
  IF candidate->>'schema_version' IS DISTINCT FROM '1.0.0' THEN RAISE EXCEPTION 'unsupported_schema'; END IF;
  IF candidate->>'target_entry_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public.knowledge_entries WHERE company_id=p_company AND id=(candidate->>'target_entry_id')::uuid) THEN RAISE EXCEPTION 'unavailable_entry'; END IF;
  r.company_id:=p_company; r.author_id:=p_author; r.content:=candidate->'content'; r.provenance:=(candidate->'provenance')||jsonb_build_object('conflicts',coalesce(candidate->'conflicts','[]')); r.entry_id:=coalesce((candidate->>'target_entry_id')::uuid,(r.provenance->'claims'->0->>'entry_id')::uuid,(r.content->>'id')::uuid,gen_random_uuid());
  IF candidate->>'kind' IN ('key_person','offering') AND NOT EXISTS(SELECT FROM private.business_leaves(r.content,'/'||private.kind_root(candidate->>'kind'))) THEN RAISE EXCEPTION 'empty_repeatable_entry'; END IF;
  PERFORM private.assert_revision(r,candidate->>'kind',(SELECT coalesce(jsonb_agg(claim),'[]') FROM jsonb_array_elements(p_proposals->'candidates') sibling,jsonb_array_elements(sibling->'provenance'->'claims') claim));
 END LOOP;
END $$;
CREATE FUNCTION private.validate_finalized_proposals() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.proposals IS DISTINCT FROM OLD.proposals AND NEW.proposals ? 'candidates' THEN
  PERFORM private.assert_proposals(NEW.company_id,NEW.requested_by,NEW.proposals);
  IF jsonb_typeof(NEW.proposals->'decisions') IS DISTINCT FROM 'array' OR (SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') FROM jsonb_array_elements(NEW.proposals->'decisions') WITH ORDINALITY q(value,ord) WHERE ord<=jsonb_array_length(coalesce(OLD.proposals->'decisions','[]'))) IS DISTINCT FROM coalesce(OLD.proposals->'decisions','[]') THEN RAISE EXCEPTION 'append_only_decisions'; END IF;
  IF OLD.proposals ? 'candidates' AND (NEW.proposals-'decisions') IS DISTINCT FROM (OLD.proposals-'decisions') THEN RAISE EXCEPTION 'immutable_candidates'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finalized_proposals BEFORE UPDATE ON public.scrape_jobs FOR EACH ROW EXECUTE FUNCTION private.validate_finalized_proposals();
CREATE FUNCTION private.finish_job(p_job uuid,p_company uuid,p_lease_token uuid,p_proposals jsonb,p_coverage jsonb) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs; candidate jsonb; e uuid; r public.knowledge_entry_versions; v_proposals jsonb; v_status text; first_import boolean; initialized_ids jsonb:='[]'; usable boolean; c public.companies; h text:=private.operation_hash(jsonb_build_array(p_proposals,p_coverage));
BEGIN
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR UPDATE;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 IF j.id IS NULL OR c.archived_at IS NOT NULL OR NOT EXISTS(SELECT FROM public.company_members WHERE company_id=p_company AND user_id=j.requested_by AND role IN ('owner','editor')) THEN RAISE EXCEPTION 'requester_unavailable'; END IF;
 IF j.status IN ('succeeded','partial','failed','cancelled') AND j.checkpoint->>'finalization_lease'=p_lease_token::text THEN
  IF j.checkpoint->>'finalization_hash' IS DISTINCT FROM h THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN j;
 END IF;
 j:=private.worker_job(p_job,p_company,p_lease_token,true);
 IF j.cancel_requested_at IS NOT NULL THEN
  UPDATE public.scrape_jobs SET status='cancelled',checkpoint=checkpoint||jsonb_build_object('finalization_lease',p_lease_token,'finalization_hash',h),finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
 END IF;
 IF j.status<>'extracting' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 IF p_proposals-ARRAY['candidates','decisions']<>'{}' OR p_proposals->'decisions' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'invalid_proposal_envelope'; END IF;
 PERFORM private.validate_json(p_coverage,private.contract_schema('provenance')->'properties'->'coverage');
 v_proposals:=jsonb_set(p_proposals,'{coverage}',p_coverage);
 IF jsonb_typeof(p_coverage)<>'array' THEN RAISE EXCEPTION 'invalid_coverage'; END IF;
 PERFORM private.assert_proposals(p_company,j.requested_by,v_proposals);
 usable:=EXISTS(SELECT FROM jsonb_array_elements(v_proposals->'candidates') proposed, LATERAL private.business_leaves(proposed->'content','/'||private.kind_root(proposed->>'kind')) leaf);
 first_import:=NOT EXISTS(SELECT FROM public.knowledge_entries WHERE company_id=p_company);
 IF first_import AND usable THEN
  IF EXISTS(SELECT FROM unnest(ARRAY['company_foundation','positioning','market_and_customers','branding_and_style','online_presence']) required_kind WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(v_proposals->'candidates') proposed WHERE proposed->>'kind'=required_kind)) THEN RAISE EXCEPTION 'invalid_first_import:five_singletons_required'; END IF;
  FOR candidate IN SELECT value FROM jsonb_array_elements(v_proposals->'candidates') LOOP
   e:=coalesce((candidate->'provenance'->'claims'->0->>'entry_id')::uuid,(candidate->'content'->>'id')::uuid,gen_random_uuid());
   initialized_ids:=initialized_ids||jsonb_build_array(e);
   INSERT INTO public.knowledge_entries(id,company_id,kind,created_by) VALUES(e,p_company,candidate->>'kind',j.requested_by);
   INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES(p_company,e,1,candidate->'content',(candidate->'provenance')||jsonb_build_object('conflicts',coalesce(candidate->'conflicts','[]')),j.requested_by);
  END LOOP;
  IF jsonb_array_length(v_proposals->'candidates')>0 THEN UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company; END IF;
 END IF;
 v_proposals:=jsonb_set(v_proposals,'{initialized_entry_ids}',initialized_ids);
 v_status:=CASE WHEN NOT usable THEN 'failed' WHEN jsonb_array_length(j.errors)>0 OR EXISTS(SELECT FROM jsonb_array_elements(p_coverage) assessment WHERE assessment->>'status' IN ('partial','conflict','not_checked')) THEN 'partial' ELSE 'succeeded' END;
 UPDATE public.scrape_jobs SET status=v_status,proposals=v_proposals,checkpoint=checkpoint||jsonb_build_object('finalization_lease',p_lease_token,'finalization_hash',h),finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
END $$;
CREATE FUNCTION private.fail_job(p_job uuid,p_company uuid,p_lease_token uuid,p_error jsonb) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs; safe jsonb; c public.companies; h text:=private.operation_hash(jsonb_build_array('failure',p_error));
BEGIN
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR UPDATE;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 IF j.id IS NULL OR c.archived_at IS NOT NULL OR NOT EXISTS(SELECT FROM public.company_members WHERE company_id=p_company AND user_id=j.requested_by AND role IN ('owner','editor')) THEN RAISE EXCEPTION 'requester_unavailable'; END IF;
 IF j.status IN ('failed','cancelled') AND j.checkpoint->>'finalization_lease'=p_lease_token::text THEN
  IF j.checkpoint->>'finalization_hash' IS DISTINCT FROM h THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN j;
 END IF;
 j:=private.worker_job(p_job,p_company,p_lease_token,true);
 PERFORM private.validate_errors(jsonb_build_array(p_error));
 IF jsonb_typeof(p_error)<>'object' OR p_error-ARRAY['code','url','retryable','message']<>'{}' OR length(coalesce(p_error->>'code','')) NOT BETWEEN 1 AND 100 OR length(coalesce(p_error->>'message','')) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p_error->'retryable')<>'boolean' THEN RAISE EXCEPTION 'invalid_safe_error'; END IF;
 safe:=jsonb_build_object('code',p_error->>'code','url',p_error->'url','retryable',p_error->'retryable','message',p_error->>'message');
 UPDATE public.scrape_jobs SET status=CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE 'failed' END,errors=errors||jsonb_build_array(safe),checkpoint=checkpoint||jsonb_build_object('finalization_lease',p_lease_token,'finalization_hash',h),finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
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
CREATE FUNCTION private.set_pointer(v jsonb,p_path text[],p_value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text:=p_path[1]; index_no integer; child jsonb; result jsonb;
BEGIN
 IF cardinality(p_path)=0 THEN RETURN p_value; END IF;
 IF jsonb_typeof(v)='array' THEN
  SELECT ord::integer-1 INTO index_no FROM jsonb_array_elements(v) WITH ORDINALITY a(value,ord) WHERE value->>'id'=substr(k,2);
  IF left(k,1)<>'@' OR index_no IS NULL THEN RAISE EXCEPTION 'unknown_pointer'; END IF;
  child:=v->index_no; result:=jsonb_set(v,ARRAY[index_no::text],private.set_pointer(child,p_path[2:],p_value),false);
 ELSE
  k:=replace(replace(k,'~1','/'),'~0','~'); IF NOT v ? k THEN RAISE EXCEPTION 'unknown_pointer'; END IF;
  result:=jsonb_set(v,ARRAY[k],private.set_pointer(v->k,p_path[2:],p_value),false);
 END IF; RETURN result;
END $$;
CREATE FUNCTION private.prepare_proposal(p_candidate jsonb,p_entry uuid,p_selected jsonb,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate jsonb:=p_candidate; provenance jsonb:=p_candidate->'provenance'; content jsonb:=p_candidate->'content'; business jsonb; root text; old_id text; claims jsonb:='[]'; claim jsonb; targets jsonb; conflict jsonb; conflicts jsonb:='[]'; decision jsonb; decisions jsonb:='[]'; selected jsonb; used text[]:='{}'; leaf text; timestamp_text text:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
 IF jsonb_typeof(p_selected) IS DISTINCT FROM 'array' OR (SELECT count(*) FROM jsonb_array_elements_text(p_selected))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_selected)) THEN RAISE EXCEPTION 'invalid_candidate_selection'; END IF;
 root:='/'||private.kind_root(candidate->>'kind');
 old_id:=coalesce(provenance->'claims'->0->>'entry_id',content->>'id',p_entry::text);
 IF candidate->>'kind' IN ('key_person','offering') THEN
  content:=jsonb_set(content,'{id}',to_jsonb(p_entry)); root:=root||'/@'||p_entry::text;
 END IF;
 FOR claim IN SELECT value FROM jsonb_array_elements(provenance->'claims') LOOP
  SELECT jsonb_agg(to_jsonb(replace(value,'/@'||old_id||'/','/@'||p_entry::text||'/'))) INTO targets FROM jsonb_array_elements_text(claim->'targets');
  claim:=jsonb_set(jsonb_set(claim,'{entry_id}',to_jsonb(p_entry)),'{targets}',targets); claims:=claims||jsonb_build_array(claim);
 END LOOP;
 FOR conflict IN SELECT value FROM jsonb_array_elements(coalesce(candidate->'conflicts','[]')) LOOP
  conflict:=jsonb_set(conflict,'{target}',to_jsonb(replace(conflict->>'target','/@'||old_id||'/','/@'||p_entry::text||'/'))); conflicts:=conflicts||jsonb_build_array(conflict);
 END LOOP;
 provenance:=jsonb_set(provenance,'{coverage}',(SELECT coalesce(jsonb_agg(jsonb_set(c,'{targets}',(SELECT jsonb_agg(replace(target,'/@'||old_id||'/','/@'||p_entry::text||'/')) FROM jsonb_array_elements_text(c->'targets') target))),'[]') FROM jsonb_array_elements(provenance->'coverage') c));
 business:=private.entry_business(candidate->>'kind',content);
 FOR conflict IN SELECT value FROM jsonb_array_elements(conflicts) LOOP
  SELECT value INTO selected FROM jsonb_array_elements(conflict->'candidates') option_row WHERE p_selected ? (option_row->>'id');
  IF (SELECT count(*) FROM jsonb_array_elements(conflict->'candidates') option_row WHERE p_selected ? (option_row->>'id'))>1 THEN RAISE EXCEPTION 'multiple_conflict_selections'; END IF;
  IF selected IS NULL THEN IF (conflict->>'material')::boolean THEN RAISE EXCEPTION 'unresolved_conflicts'; END IF; CONTINUE; END IF;
  used:=array_append(used,selected->>'id');
  business:=private.set_pointer(business,string_to_array(substr(conflict->>'target',2),'/'),selected->'value');
  SELECT coalesce(jsonb_agg(jsonb_set(existing,'{targets}',remaining)),'[]') INTO claims FROM (SELECT existing,(SELECT coalesce(jsonb_agg(target),'[]') FROM jsonb_array_elements_text(existing->'targets') target WHERE target<>conflict->>'target' AND left(target,length(conflict->>'target')+1)<>(conflict->>'target')||'/') remaining FROM jsonb_array_elements(claims) existing) remaining_claims WHERE jsonb_array_length(remaining)>0;
  FOR leaf IN SELECT * FROM private.business_leaves(selected->'value',conflict->>'target') LOOP
   claims:=claims||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'entry_id',p_entry,'targets',jsonb_build_array(leaf),'origin',selected->>'origin','evidence_ids',selected->'evidence_ids','based_on_claim_ids',selected->'based_on_claim_ids','actor_id',CASE WHEN selected->>'origin'='user_provided' THEN p_actor ELSE NULL END,'authored_at',CASE WHEN selected->>'origin'='user_provided' THEN timestamp_text ELSE NULL END,'note',CASE WHEN selected->>'origin'='user_provided' THEN 'Reviewer selected a user-provided correction.' ELSE NULL END));
  END LOOP;
  decisions:=decisions||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'conflict_id',conflict->>'id','target',conflict->>'target','action','select','candidate_id',selected->>'id','actor_id',p_actor,'decided_at',timestamp_text,'note','Reviewer selected this candidate.'));
 END LOOP;
 IF cardinality(used)<>jsonb_array_length(p_selected) THEN RAISE EXCEPTION 'unknown_candidate_selection'; END IF;
 content:=private.resolve_pointer(business,root);
 provenance:=provenance||jsonb_build_object('claims',claims,'conflicts',conflicts,'decisions',decisions);
 RETURN candidate||jsonb_build_object('content',content,'provenance',provenance,'conflicts',conflicts);
END $$;
CREATE FUNCTION private.fill_unknown(p_current jsonb,p_candidate jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; x jsonb; result jsonb:='{}';
BEGIN
 IF p_current='null'::jsonb OR p_current='""'::jsonb OR p_current='[]'::jsonb THEN RETURN p_candidate; END IF;
 IF jsonb_typeof(p_current)='object' AND jsonb_typeof(p_candidate)='object' THEN
  FOR k,x IN SELECT * FROM jsonb_each(p_current) LOOP result:=result||jsonb_build_object(k,private.fill_unknown(x,coalesce(p_candidate->k,x))); END LOOP; RETURN result;
 END IF; RETURN p_current;
END $$;
CREATE FUNCTION private.unique_json(p_values jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(value ORDER BY first_ord),'[]') FROM (SELECT value,min(ord) first_ord FROM jsonb_array_elements(p_values) WITH ORDINALITY q(value,ord) GROUP BY value) values_by_order
$$;
CREATE FUNCTION private.merge_saved_proposal(p_candidate jsonb,p_old public.knowledge_entry_versions,p_kind text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate jsonb:=p_candidate; provenance jsonb:=p_candidate->'provenance'; old_business jsonb:=private.entry_business(p_kind,p_old.content); candidate_business jsonb:=private.entry_business(p_kind,p_candidate->'content'); merged_business jsonb; root text:='/'||private.kind_root(p_kind); claim jsonb; target text; chosen text[]:='{}'; candidate_targets text[]:='{}'; old_value jsonb; new_value jsonb; merged_claims jsonb:='[]'; keep_targets jsonb; decision jsonb;
BEGIN
 IF p_kind IN ('key_person','offering') THEN root:=root||'/@'||p_old.entry_id::text; END IF;
 merged_business:=private.entry_business(p_kind,private.fill_unknown(p_old.content,p_candidate->'content'));
 FOR decision IN SELECT value FROM jsonb_array_elements(coalesce(provenance->'decisions','[]')) LOOP
  target:=decision->>'target'; chosen:=array_append(chosen,target);
  merged_business:=private.set_pointer(merged_business,string_to_array(substr(target,2),'/'),private.resolve_pointer(candidate_business,target));
 END LOOP;
 FOR target IN SELECT * FROM private.business_leaves(private.resolve_pointer(merged_business,root),root) LOOP
  BEGIN old_value:=private.resolve_pointer(old_business,target); EXCEPTION WHEN raise_exception THEN old_value:=NULL; END;
  new_value:=private.resolve_pointer(merged_business,target);
  IF old_value IS DISTINCT FROM new_value OR EXISTS(SELECT FROM unnest(chosen) selected_target WHERE target=selected_target OR left(target,length(selected_target)+1)=selected_target||'/') THEN candidate_targets:=array_append(candidate_targets,target); END IF;
 END LOOP;
 FOR claim IN SELECT value FROM jsonb_array_elements(p_old.provenance->'claims') LOOP
  SELECT coalesce(jsonb_agg(t),'[]') INTO keep_targets FROM jsonb_array_elements_text(claim->'targets') t WHERE NOT t=ANY(candidate_targets) AND EXISTS(SELECT FROM private.business_leaves(private.resolve_pointer(merged_business,root),root) leaf WHERE leaf=t);
  IF jsonb_array_length(keep_targets)>0 THEN merged_claims:=merged_claims||jsonb_build_array(jsonb_set(claim,'{targets}',keep_targets)); END IF;
 END LOOP;
 FOR claim IN SELECT value FROM jsonb_array_elements(provenance->'claims') LOOP
  SELECT coalesce(jsonb_agg(t),'[]') INTO keep_targets FROM jsonb_array_elements_text(claim->'targets') t WHERE t=ANY(candidate_targets);
  IF jsonb_array_length(keep_targets)>0 THEN merged_claims:=merged_claims||jsonb_build_array(jsonb_set(claim,'{targets}',keep_targets)); END IF;
 END LOOP;
 provenance:=provenance||jsonb_build_object('claims',merged_claims,'sources',private.unique_json((p_old.provenance->'sources')||(provenance->'sources')),'evidence',private.unique_json((p_old.provenance->'evidence')||(provenance->'evidence')),'operations',private.unique_json((p_old.provenance->'operations')||(provenance->'operations')));
 RETURN candidate||jsonb_build_object('content',private.resolve_pointer(merged_business,root),'provenance',provenance);
END $$;
CREATE FUNCTION public.apply_proposal(p_company uuid,p_job uuid,p_proposal uuid,p_entry uuid,p_expected_revision integer,p_selected_candidate_ids jsonb,p_request uuid) RETURNS public.knowledge_entry_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs; candidate jsonb; r public.knowledge_entry_versions; previous public.knowledge_entry_versions; e public.knowledge_entries; h text:=private.operation_hash(jsonb_build_array('apply',p_job,p_proposal,p_entry,p_expected_revision,p_selected_candidate_ids));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 SELECT value INTO candidate FROM jsonb_array_elements(j.proposals->'candidates') WHERE value->>'id'=p_proposal::text;
 IF candidate IS NULL OR j.status NOT IN ('succeeded','partial') THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF p_entry IS NULL THEN
  e.id:=coalesce((candidate->'provenance'->'claims'->0->>'entry_id')::uuid,(candidate->'content'->>'id')::uuid,gen_random_uuid()); e.current_revision:=0;
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
  candidate:=private.merge_saved_proposal(candidate,previous,e.kind);
 END IF;
 INSERT INTO public.knowledge_entry_versions(company_id,entry_id,revision,content,provenance,author_id) VALUES(p_company,e.id,e.current_revision+1,candidate->'content',private.operation_provenance(candidate->'provenance',p_request,e.id,'apply_proposal',h),auth.uid()) RETURNING * INTO r;
 UPDATE public.knowledge_entries SET current_revision=r.revision WHERE company_id=p_company AND id=e.id;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company;
 UPDATE public.scrape_jobs SET proposals=jsonb_set(proposals,'{decisions}',coalesce(proposals->'decisions','[]')||jsonb_build_array(jsonb_build_object('proposal_id',p_proposal,'action','apply','actor_id',auth.uid(),'at',now(),'revision_id',r.id))),updated_at=now() WHERE id=p_job; RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION private.finish_job(uuid,uuid,uuid,jsonb,jsonb),private.fail_job(uuid,uuid,uuid,jsonb) TO moflo_worker;
GRANT EXECUTE ON FUNCTION public.dismiss_proposal(uuid,uuid,uuid,text),public.apply_proposal(uuid,uuid,uuid,uuid,integer,jsonb,uuid) TO authenticated;
COMMIT;
