BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.assert_proposal_changes(p_candidate jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE change jsonb; target text; ids text[]:='{}'; targets text[]:='{}'; entry_id text:=coalesce(p_candidate->'content'->>'id',p_candidate->'provenance'->'claims'->0->>'entry_id');
BEGIN
 IF jsonb_typeof(coalesce(p_candidate->'changes','[]'))<>'array' OR jsonb_array_length(coalesce(p_candidate->'changes','[]'))>41 THEN RAISE EXCEPTION 'invalid_proposal_changes'; END IF;
 FOR change IN SELECT value FROM jsonb_array_elements(coalesce(p_candidate->'changes','[]')) LOOP
  IF jsonb_typeof(change)<>'object' OR change-ARRAY['id','target']<>'{}' OR NOT change ?& ARRAY['id','target'] THEN RAISE EXCEPTION 'invalid_proposal_change'; END IF;
  PERFORM (change->>'id')::uuid; target:=change->>'target';
  IF change->>'id' IS NULL OR target IS NULL OR change->>'id'=ANY(ids) OR target=ANY(targets) THEN RAISE EXCEPTION 'duplicate_proposal_change'; END IF;
  ids:=array_append(ids,change->>'id'); targets:=array_append(targets,target);
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(private.field_registry()) f WHERE f->>'kind'=p_candidate->>'kind' AND replace(f->>'path','@id','@'||coalesce(entry_id,''))=target) THEN RAISE EXCEPTION 'invalid_proposal_change_target'; END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_candidate->'conflicts','[]')||coalesce(p_candidate->'provenance'->'conflicts','[]')) conflict WHERE conflict->>'target'=target OR left(conflict->>'target',length(target)+1)=target||'/' OR left(target,length(conflict->>'target')+1)=(conflict->>'target')||'/') THEN RAISE EXCEPTION 'proposal_change_conflict_overlap'; END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_candidate->'conflicts','[]')||coalesce(p_candidate->'provenance'->'conflicts','[]')) conflict,jsonb_array_elements(conflict->'candidates') candidate WHERE candidate->>'id'=change->>'id') THEN RAISE EXCEPTION 'duplicate_proposal_selection_id'; END IF;
  IF NOT EXISTS(SELECT FROM private.business_leaves(private.resolve_pointer(private.entry_business(p_candidate->>'kind',p_candidate->'content'),target),target)) THEN RAISE EXCEPTION 'empty_proposal_change'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.entry_defaults(p_kind text,p_entry uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(f->>'field',f->'default'),'{}') || CASE WHEN p_kind IN ('key_person','offering') THEN jsonb_build_object('id',p_entry) ELSE '{}'::jsonb END FROM jsonb_array_elements(private.field_registry()) f WHERE f->>'kind'=p_kind
$$;
CREATE FUNCTION private.empty_entry_provenance(p_kind text,p_entry uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('sources','[]'::jsonb,'evidence','[]'::jsonb,'claims','[]'::jsonb,'conflicts','[]'::jsonb,'decisions','[]'::jsonb,'operations','[]'::jsonb,'coverage',coalesce(jsonb_agg(jsonb_build_object('targets',jsonb_build_array(replace(f->>'path','@id','@'||p_entry::text)),'status','not_checked','job_id',NULL,'reason','This field was not selected from the proposal.')),'[]')) FROM jsonb_array_elements(private.field_registry()) f WHERE f->>'kind'=p_kind
$$;
CREATE OR REPLACE FUNCTION private.prepare_proposal(p_candidate jsonb,p_entry uuid,p_selected jsonb,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate jsonb:=p_candidate; provenance jsonb:=p_candidate->'provenance'; content jsonb:=p_candidate->'content'; business jsonb; root text; old_id text; claims jsonb:='[]'; claim jsonb; targets jsonb; conflict jsonb; conflicts jsonb:='[]'; selected_conflicts jsonb:='[]'; decisions jsonb:='[]'; selected jsonb; change jsonb; used text[]:='{}'; chosen_targets jsonb:='[]'; leaf text; timestamp_text text:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
 PERFORM private.assert_proposal_changes(candidate);
 IF jsonb_typeof(p_selected) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selected)=0 OR jsonb_array_length(p_selected)>1000 OR (SELECT count(*) FROM jsonb_array_elements_text(p_selected))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_selected)) THEN RAISE EXCEPTION 'invalid_candidate_selection'; END IF;
 root:='/'||private.kind_root(candidate->>'kind'); old_id:=coalesce(provenance->'claims'->0->>'entry_id',content->>'id',p_entry::text);
 IF candidate->>'kind' IN ('key_person','offering') THEN content:=jsonb_set(content,'{id}',to_jsonb(p_entry)); root:=root||'/@'||p_entry::text; END IF;
 FOR claim IN SELECT value FROM jsonb_array_elements(provenance->'claims') LOOP
  SELECT jsonb_agg(to_jsonb(replace(value,'/@'||old_id||'/','/@'||p_entry::text||'/'))) INTO targets FROM jsonb_array_elements_text(claim->'targets');
  claims:=claims||jsonb_build_array(jsonb_set(jsonb_set(claim,'{entry_id}',to_jsonb(p_entry)),'{targets}',targets));
 END LOOP;
 FOR change IN SELECT value FROM jsonb_array_elements(coalesce(candidate->'changes','[]')) LOOP
  IF p_selected ? (change->>'id') THEN
   used:=array_append(used,change->>'id'); chosen_targets:=chosen_targets||jsonb_build_array(replace(change->>'target','/@'||old_id||'/','/@'||p_entry::text||'/'));
  END IF;
 END LOOP;
 FOR conflict IN SELECT value FROM jsonb_array_elements(coalesce(candidate->'conflicts','[]')) LOOP
  conflicts:=conflicts||jsonb_build_array(jsonb_set(conflict,'{target}',to_jsonb(replace(conflict->>'target','/@'||old_id||'/','/@'||p_entry::text||'/'))));
 END LOOP;
 provenance:=jsonb_set(provenance,'{coverage}',(SELECT coalesce(jsonb_agg(jsonb_set(c,'{targets}',(SELECT jsonb_agg(replace(target,'/@'||old_id||'/','/@'||p_entry::text||'/')) FROM jsonb_array_elements_text(c->'targets') target))),'[]') FROM jsonb_array_elements(provenance->'coverage') c));
 business:=private.entry_business(candidate->>'kind',content);
 FOR conflict IN SELECT value FROM jsonb_array_elements(conflicts) LOOP
  SELECT value INTO selected FROM jsonb_array_elements(conflict->'candidates') option_row WHERE p_selected ? (option_row->>'id');
  IF (SELECT count(*) FROM jsonb_array_elements(conflict->'candidates') option_row WHERE p_selected ? (option_row->>'id'))>1 THEN RAISE EXCEPTION 'multiple_conflict_selections'; END IF;
  IF selected IS NULL THEN CONTINUE; END IF;
  used:=array_append(used,selected->>'id'); chosen_targets:=chosen_targets||jsonb_build_array(conflict->>'target'); selected_conflicts:=selected_conflicts||jsonb_build_array(conflict);
  business:=private.set_pointer(business,string_to_array(substr(conflict->>'target',2),'/'),selected->'value');
  SELECT coalesce(jsonb_agg(jsonb_set(existing,'{targets}',remaining)),'[]') INTO claims FROM (SELECT existing,(SELECT coalesce(jsonb_agg(target),'[]') FROM jsonb_array_elements_text(existing->'targets') target WHERE target<>conflict->>'target' AND left(target,length(conflict->>'target')+1)<>(conflict->>'target')||'/') remaining FROM jsonb_array_elements(claims) existing) remaining_claims WHERE jsonb_array_length(remaining)>0;
  FOR leaf IN SELECT * FROM private.business_leaves(selected->'value',conflict->>'target') LOOP
   claims:=claims||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'entry_id',p_entry,'targets',jsonb_build_array(leaf),'origin',selected->>'origin','evidence_ids',selected->'evidence_ids','based_on_claim_ids',selected->'based_on_claim_ids','actor_id',CASE WHEN selected->>'origin'='user_provided' THEN p_actor ELSE NULL END,'authored_at',CASE WHEN selected->>'origin'='user_provided' THEN timestamp_text ELSE NULL END,'note',CASE WHEN selected->>'origin'='user_provided' THEN 'Reviewer selected a user-provided correction.' ELSE NULL END));
  END LOOP;
  decisions:=decisions||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'conflict_id',conflict->>'id','target',conflict->>'target','action','select','candidate_id',selected->>'id','actor_id',p_actor,'decided_at',timestamp_text,'note','Reviewer selected this candidate.'));
 END LOOP;
 IF cardinality(used)<>jsonb_array_length(p_selected) THEN RAISE EXCEPTION 'invalid_candidate_selection:unknown'; END IF;
 provenance:=provenance||jsonb_build_object('claims',claims,'conflicts',selected_conflicts,'decisions',decisions);
 RETURN candidate||jsonb_build_object('content',private.resolve_pointer(business,root),'provenance',provenance,'selection_targets',chosen_targets);
END $$;
CREATE OR REPLACE FUNCTION private.merge_saved_proposal(p_candidate jsonb,p_old public.knowledge_entry_versions,p_kind text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate jsonb:=p_candidate; provenance jsonb:=p_candidate->'provenance'; candidate_business jsonb:=private.entry_business(p_kind,p_candidate->'content'); merged_business jsonb:=private.entry_business(p_kind,p_old.content); root text:='/'||private.kind_root(p_kind); selected_targets text[]; claim jsonb; target text; merged_claims jsonb:='[]'; keep_targets jsonb; conflicts jsonb; decisions jsonb; coverage jsonb:='[]'; field jsonb; assessment jsonb;
BEGIN
 IF p_kind IN ('key_person','offering') THEN root:=root||'/@'||p_old.entry_id::text; END IF;
 SELECT array_agg(value) INTO selected_targets FROM jsonb_array_elements_text(p_candidate->'selection_targets');
 FOREACH target IN ARRAY selected_targets LOOP merged_business:=private.set_pointer(merged_business,string_to_array(substr(target,2),'/'),private.resolve_pointer(candidate_business,target)); END LOOP;
 FOR claim IN SELECT value FROM jsonb_array_elements(p_old.provenance->'claims') LOOP
  SELECT coalesce(jsonb_agg(t),'[]') INTO keep_targets FROM jsonb_array_elements_text(claim->'targets') t WHERE NOT EXISTS(SELECT FROM unnest(selected_targets) selected_target WHERE t=selected_target OR left(t,length(selected_target)+1)=selected_target||'/');
  IF jsonb_array_length(keep_targets)>0 THEN merged_claims:=merged_claims||jsonb_build_array(jsonb_set(claim,'{targets}',keep_targets)); END IF;
 END LOOP;
 FOR claim IN SELECT value FROM jsonb_array_elements(provenance->'claims') LOOP
  SELECT coalesce(jsonb_agg(t),'[]') INTO keep_targets FROM jsonb_array_elements_text(claim->'targets') t WHERE EXISTS(SELECT FROM unnest(selected_targets) selected_target WHERE t=selected_target OR left(t,length(selected_target)+1)=selected_target||'/');
  IF jsonb_array_length(keep_targets)>0 THEN merged_claims:=merged_claims||jsonb_build_array(jsonb_set(claim,'{targets}',keep_targets)); END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(old_conflict),'[]') INTO conflicts FROM jsonb_array_elements(coalesce(p_old.provenance->'conflicts','[]')) old_conflict WHERE
  NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_old.provenance->'decisions','[]')) old_decision WHERE old_decision->>'conflict_id'=old_conflict->>'id')
  OR NOT EXISTS(SELECT FROM unnest(selected_targets) selected_target WHERE old_conflict->>'target'=selected_target OR left(old_conflict->>'target',length(selected_target)+1)=selected_target||'/')
  OR EXISTS(SELECT FROM jsonb_array_elements(provenance->'conflicts') new_conflict WHERE new_conflict->>'id'=old_conflict->>'id');
 conflicts:=private.unique_json(conflicts||(provenance->'conflicts'));
 SELECT coalesce(jsonb_agg(old_decision),'[]') INTO decisions FROM jsonb_array_elements(coalesce(p_old.provenance->'decisions','[]')) old_decision WHERE EXISTS(SELECT FROM jsonb_array_elements(conflicts) cf WHERE cf->>'id'=old_decision->>'conflict_id') AND NOT EXISTS(SELECT FROM jsonb_array_elements(provenance->'decisions') new_decision WHERE new_decision->>'conflict_id'=old_decision->>'conflict_id');
 decisions:=decisions||(provenance->'decisions');
 FOR field IN SELECT value FROM jsonb_array_elements(private.field_registry()) WHERE value->>'kind'=p_kind LOOP
  target:=replace(field->>'path','@id','@'||p_old.entry_id::text);
  IF EXISTS(SELECT FROM unnest(selected_targets) selected_target WHERE selected_target=target OR left(selected_target,length(target)+1)=target||'/') THEN
   SELECT value INTO assessment FROM jsonb_array_elements(provenance->'coverage') c WHERE c->'targets' ? target;
  ELSE SELECT value INTO assessment FROM jsonb_array_elements(p_old.provenance->'coverage') c WHERE c->'targets' ? target; END IF;
  IF assessment IS NULL THEN RAISE EXCEPTION 'coverage_required'; END IF;
  coverage:=coverage||jsonb_build_array(jsonb_set(assessment,'{targets}',jsonb_build_array(target)));
 END LOOP;
 provenance:=provenance||jsonb_build_object('claims',merged_claims,'conflicts',conflicts,'decisions',decisions,'coverage',coverage,'sources',private.unique_json((p_old.provenance->'sources')||(provenance->'sources')),'evidence',private.unique_json((p_old.provenance->'evidence')||(provenance->'evidence')),'operations',private.unique_json((p_old.provenance->'operations')||(provenance->'operations')));
 RETURN candidate||jsonb_build_object('content',private.resolve_pointer(merged_business,root),'provenance',provenance);
END $$;
DROP FUNCTION private.fill_unknown(jsonb,jsonb);
CREATE OR REPLACE FUNCTION private.assert_proposals(p_company uuid,p_author uuid,p_proposals jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate jsonb; r public.knowledge_entry_versions; ids text[]:='{}';
BEGIN
 IF jsonb_typeof(p_proposals)<>'object' OR jsonb_typeof(p_proposals->'candidates')<>'array' OR jsonb_array_length(p_proposals->'candidates')>100 OR octet_length(p_proposals::text)>4194304 THEN RAISE EXCEPTION 'invalid_proposals'; END IF;
 FOR candidate IN SELECT value FROM jsonb_array_elements(p_proposals->'candidates') LOOP
  PERFORM private.assert_proposal_changes(candidate);
  PERFORM (candidate->>'id')::uuid;
  IF candidate->>'id' IS NULL OR candidate->>'id'=ANY(ids) THEN RAISE EXCEPTION 'duplicate_proposal_id'; END IF; ids:=ids||(candidate->>'id');
  IF candidate->>'schema_version' IS DISTINCT FROM '1.0.0' THEN RAISE EXCEPTION 'unsupported_schema'; END IF;
  IF candidate->>'target_entry_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public.knowledge_entries WHERE company_id=p_company AND id=(candidate->>'target_entry_id')::uuid) THEN RAISE EXCEPTION 'unavailable_entry'; END IF;
  r.company_id:=p_company; r.author_id:=p_author; r.content:=candidate->'content'; r.provenance:=(candidate->'provenance')||jsonb_build_object('conflicts',coalesce(candidate->'conflicts','[]')); r.entry_id:=coalesce((candidate->>'target_entry_id')::uuid,(r.provenance->'claims'->0->>'entry_id')::uuid,(r.content->>'id')::uuid,gen_random_uuid());
  IF candidate->>'kind' IN ('key_person','offering') AND NOT EXISTS(SELECT FROM private.business_leaves(r.content,'/'||private.kind_root(candidate->>'kind'))) THEN RAISE EXCEPTION 'empty_repeatable_entry'; END IF;
  PERFORM private.assert_revision(r,candidate->>'kind',(SELECT coalesce(jsonb_agg(claim),'[]') FROM jsonb_array_elements(p_proposals->'candidates') sibling,jsonb_array_elements(sibling->'provenance'->'claims') claim));
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.apply_proposal(p_company uuid,p_job uuid,p_proposal uuid,p_entry uuid,p_expected_revision integer,p_selected_candidate_ids jsonb,p_request uuid) RETURNS public.knowledge_entry_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs; candidate jsonb; r public.knowledge_entry_versions; previous public.knowledge_entry_versions; e public.knowledge_entries; h text:=private.operation_hash(jsonb_build_array('apply',p_job,p_proposal,p_entry,p_expected_revision,p_selected_candidate_ids));
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 r:=private.prior_operation(p_company,p_request,h); IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 SELECT value INTO candidate FROM jsonb_array_elements(j.proposals->'candidates') WHERE value->>'id'=p_proposal::text;
 IF candidate IS NULL OR j.status NOT IN ('succeeded','partial') THEN RAISE EXCEPTION 'unavailable'; END IF;
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
