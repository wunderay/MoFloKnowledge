-- Deleting a key person or an offering is an archive, not an erase. The entry row stays with all of its revisions
-- (the history is immutable and saved versions keep the person), and gets a tombstone: archived_at, archived_by and
-- the request that archived it. 0001-0019 stay frozen; the tombstone is layered on top of them here.
--  * Only repeatable kinds (key_person, offering) can be archived; the five singleton kinds are never deleted.
--  * An archived entry is invisible to members (row security), absent from drafts, the next snapshot, the publication
--    manifest and the worker's resume bundle, and takes no new revision.
--  * public.archive_entry is the only way to set a tombstone: owner or editor of a live company, the revision the caller
--    saw, and a request id so that a retry of the same request is answered once.
BEGIN;
SET ROLE moflo_owner;
ALTER TABLE public.knowledge_entries
  ADD COLUMN archived_at timestamptz NULL,
  ADD COLUMN archived_by uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN archive_request_id uuid NULL,
  ADD CONSTRAINT knowledge_entries_archive_check CHECK (
    (archived_at IS NULL) = (archived_by IS NULL) AND (archived_at IS NULL) = (archive_request_id IS NULL));
CREATE UNIQUE INDEX knowledge_entries_archive_request_idx ON public.knowledge_entries(company_id,archive_request_id) WHERE archive_request_id IS NOT NULL;
CREATE INDEX knowledge_entries_archiver_idx ON public.knowledge_entries(archived_by) WHERE archived_by IS NOT NULL;
-- The tombstone itself may be set once and never changes (the update path is archive_entry alone).
CREATE OR REPLACE FUNCTION private.identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='knowledge_entries' THEN
  IF (to_jsonb(NEW)-'current_revision'-'archived_at'-'archived_by'-'archive_request_id') IS DISTINCT FROM (to_jsonb(OLD)-'current_revision'-'archived_at'-'archived_by'-'archive_request_id') THEN RAISE EXCEPTION 'immutable_identity'; END IF;
  -- Only repeatable entries are ever archived, whichever statement tries to.
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND OLD.kind NOT IN ('key_person','offering') THEN RAISE EXCEPTION 'invalid_entry_kind'; END IF;
  -- A tombstone is permanent: once archived, nothing about the entry changes again.
  IF OLD.archived_at IS NOT NULL AND (NEW.archived_at,NEW.archived_by,NEW.archive_request_id,NEW.current_revision) IS DISTINCT FROM (OLD.archived_at,OLD.archived_by,OLD.archive_request_id,OLD.current_revision) THEN RAISE EXCEPTION 'immutable_identity'; END IF;
 END IF;
 IF TG_TABLE_NAME='companies' THEN
  IF (NEW.id,NEW.created_by,NEW.creation_request_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.created_by,OLD.creation_request_id,OLD.created_at) THEN RAISE EXCEPTION 'immutable_identity'; END IF;
  IF (NEW.name,NEW.website_url) IS DISTINCT FROM (OLD.name,OLD.website_url) THEN NEW.draft_generation:=OLD.draft_generation+1; END IF;
  NEW.updated_at:=now();
 END IF;
 IF TG_TABLE_NAME='company_members' THEN
  IF (NEW.company_id,NEW.user_id,NEW.added_by,NEW.created_at) IS DISTINCT FROM (OLD.company_id,OLD.user_id,OLD.added_by,OLD.created_at) THEN RAISE EXCEPTION 'immutable_identity'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Members no longer see an archived entry or its revisions; the history stays in the database.
DROP POLICY tenant_read ON public.knowledge_entries;
CREATE POLICY tenant_read ON public.knowledge_entries FOR SELECT TO authenticated USING(private.company_role(company_id) IS NOT NULL AND archived_at IS NULL);
DROP POLICY tenant_read ON public.knowledge_entry_versions;
CREATE POLICY tenant_read ON public.knowledge_entry_versions FOR SELECT TO authenticated USING(private.company_role(company_id) IS NOT NULL AND EXISTS(SELECT FROM public.knowledge_entries e WHERE e.company_id=knowledge_entry_versions.company_id AND e.id=knowledge_entry_versions.entry_id));
-- No revision of any kind (save, revert, applied proposal) is written to an archived entry.
CREATE FUNCTION private.reject_archived_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM public.knowledge_entries e WHERE e.company_id=NEW.company_id AND e.id=NEW.entry_id AND e.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'unavailable_archived_entry' USING ERRCODE='P0002'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reject_archived_entry BEFORE INSERT ON public.knowledge_entry_versions FOR EACH ROW EXECUTE FUNCTION private.reject_archived_entry();
-- Publication, the manifest check and the worker's resume bundle read live entries only.
CREATE OR REPLACE FUNCTION private.assemble_snapshot(p_company uuid,p_id uuid,p_version bigint,p_saved_at timestamptz,p_author uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.companies; v record; b jsonb:=private.business_defaults(); p jsonb; src jsonb:='[]'; ev jsonb:='[]'; cl jsonb:='[]'; cov jsonb:='[]'; ops jsonb:='[]'; entries jsonb:='[]'; section text; sources jsonb; target text; assessment jsonb; normalized_coverage jsonb:='[]'; field jsonb; item jsonb; targets text[]:='{}'; decision_ops jsonb:='[]'; d jsonb;
BEGIN
 SELECT * INTO c FROM public.companies WHERE id=p_company;
 FOR v IN SELECT e.kind,r.* FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=p_company AND e.archived_at IS NULL ORDER BY e.created_at,e.id LOOP
  IF v.review_status='unreviewed' THEN RAISE EXCEPTION 'unreviewed_entries'; END IF;
  entries:=entries||jsonb_build_array(jsonb_build_object('entry_id',v.entry_id,'kind',v.kind,'revision',v.revision,'review_status',v.review_status,'author_id',v.author_id,'saved_at',to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  IF v.review_status='approved' THEN
   section:=private.kind_root(v.kind);
   IF v.kind IN ('key_person','offering') THEN b:=jsonb_set(b,ARRAY[section],(b->section)||jsonb_build_array(private.entry_defaults(v.kind,v.entry_id)||v.content)); ELSE b:=jsonb_set(b,ARRAY[section],private.entry_defaults(v.kind,v.entry_id)||v.content); END IF;
   src:=src||(v.provenance->'sources'); ev:=ev||(v.provenance->'evidence'); cl:=cl||(v.provenance->'claims'); ops:=ops||(v.provenance->'operations'); cov:=cov||(v.provenance->'coverage');
   FOR d IN SELECT value FROM jsonb_array_elements(coalesce(v.provenance->'decisions','[]')) LOOP
    decision_ops:=decision_ops||jsonb_build_array(jsonb_build_object('request_id',d->>'id','entry_id',v.entry_id,'kind','conflict_'||(d->>'action'),'supersedes_claim_id',NULL,'note','Target '||(d->>'target')||'; conflict '||(d->>'conflict_id')||'; selected candidate '||coalesce(d->>'candidate_id','none')||'; reviewer '||(d->>'actor_id')||'; decided '||(d->>'decided_at')||'. '||(d->>'note')));
   END LOOP;
  END IF;
 END LOOP;
 ops:=ops||decision_ops;
 IF jsonb_array_length(cl)=0 AND NOT EXISTS(SELECT FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=p_company AND e.archived_at IS NULL AND r.review_status='approved') THEN RAISE EXCEPTION 'no_approved_entries'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(cl) current_claim, jsonb_array_elements_text(current_claim->'based_on_claim_ids') supporting_id WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(cl) supporting_claim WHERE supporting_claim->>'id'=supporting_id)) THEN RAISE EXCEPTION 'stale_supporting_claim'; END IF;
 -- Keep only approved referenced evidence in stable insertion order; frozen source values come from stored captures.
 SELECT coalesce(jsonb_agg(x ORDER BY first_ord),'[]') INTO cl FROM (SELECT x,min(ord) first_ord FROM jsonb_array_elements(cl) WITH ORDINALITY q(x,ord) GROUP BY x) q;
 SELECT coalesce(jsonb_agg(x ORDER BY first_ord),'[]') INTO ev FROM (SELECT x,min(ord) first_ord FROM jsonb_array_elements(ev) WITH ORDINALITY q(x,ord) WHERE EXISTS(SELECT FROM jsonb_array_elements(cl) claim WHERE claim->'evidence_ids' ? (x->>'id')) GROUP BY x) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'url',s.final_url,'title',s.title,'author',s.author,'site_name',s.site_name,'published_on',s.published_on,'retrieved_at',to_char(s.retrieved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY source_order.first_ord),'[]') INTO sources FROM public.source_pages s JOIN (SELECT x->>'id' id,min(ord) first_ord FROM jsonb_array_elements(src) WITH ORDINALITY q(x,ord) GROUP BY x->>'id') source_order ON source_order.id=s.id::text WHERE s.company_id=p_company AND EXISTS(SELECT FROM jsonb_array_elements(ev) evidence_row WHERE evidence_row->>'source_page_id'=s.id::text);
 SELECT coalesce(jsonb_agg(jsonb_set(x,'{note}',coalesce(to_jsonb(left(x->>'note',2000)),'null')) ORDER BY ord),'[]') INTO ops FROM jsonb_array_elements(ops) WITH ORDINALITY q(x,ord) WHERE x->>'kind'<>'rejected_candidate';
 FOR field IN SELECT value FROM jsonb_array_elements(private.field_registry()) LOOP
  section:=private.kind_root(field->>'kind');
  IF field->>'kind' IN ('key_person','offering') THEN
   IF jsonb_array_length(b->section)=0 THEN
    target:='/'||section; IF NOT target=ANY(targets) THEN targets:=array_append(targets,target); END IF;
   ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(b->section) LOOP targets:=array_append(targets,replace(field->>'path','@id','@'||(item->>'id'))); END LOOP;
   END IF;
  ELSE targets:=array_append(targets,field->>'path'); END IF;
 END LOOP;
 FOREACH target IN ARRAY targets LOOP
  SELECT value INTO assessment FROM jsonb_array_elements(cov) WHERE value->'targets' ? target;
  IF assessment IS NULL THEN
   assessment:=jsonb_build_object('status','not_checked','job_id',NULL,'reason',CASE WHEN EXISTS(SELECT FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=p_company AND e.archived_at IS NULL AND r.review_status='rejected' AND private.kind_root(e.kind)=split_part(target,'/',2)) THEN 'Entry rejected and excluded by reviewer.' ELSE 'No approved entry assessed this field.' END);
  END IF;
  normalized_coverage:=normalized_coverage||jsonb_build_array(jsonb_set(assessment,'{targets}',jsonb_build_array(target)));
 END LOOP;
 cov:=normalized_coverage;
 IF (SELECT count(*) FROM private.business_ids(b))<>(SELECT count(DISTINCT id) FROM private.business_ids(b) id) THEN RAISE EXCEPTION 'duplicate_business_id'; END IF;
 IF (SELECT count(*) FROM (SELECT x->>'id' id FROM jsonb_array_elements(cl) x UNION ALL SELECT x->>'id' FROM jsonb_array_elements(ev) x UNION ALL SELECT x->>'id' FROM jsonb_array_elements(sources) x) ids)<>(SELECT count(DISTINCT id) FROM (SELECT x->>'id' id FROM jsonb_array_elements(cl) x UNION ALL SELECT x->>'id' FROM jsonb_array_elements(ev) x UNION ALL SELECT x->>'id' FROM jsonb_array_elements(sources) x) ids) THEN RAISE EXCEPTION 'conflicting_provenance_uuid'; END IF;
 p:=jsonb_build_object('company',jsonb_build_object('name',c.name,'website',c.website_url,'snapshot_author_id',p_author),'entries',entries,'sources',sources,'evidence',ev,'claims',cl,'coverage',cov,'operations',ops);
 RETURN b||jsonb_build_object('schema_version','1.0.0','company_id',p_company,'knowledge_base_version_id',p_id,'version',p_version,'saved_at',to_char(p_saved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'provenance',p);
END $$;
CREATE OR REPLACE FUNCTION private.validate_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m jsonb; r public.knowledge_entry_versions; actual jsonb; expected_manifest jsonb;
BEGIN
 PERFORM private.validate_json(NEW.payload,private.contract_schema('export'));
 SELECT coalesce(jsonb_agg(jsonb_build_object('entry_id',e.id,'revision_id',v.id,'revision',v.revision,'expected_generation',c.draft_generation) ORDER BY e.created_at,e.id),'[]') INTO expected_manifest FROM public.companies c JOIN public.knowledge_entries e ON e.company_id=c.id JOIN public.knowledge_entry_versions v ON v.company_id=e.company_id AND v.entry_id=e.id AND v.revision=e.current_revision WHERE c.id=NEW.company_id AND e.archived_at IS NULL AND v.review_status='approved';
 IF NEW.entry_manifest IS DISTINCT FROM expected_manifest THEN RAISE EXCEPTION 'snapshot_manifest_mismatch'; END IF;
 IF jsonb_array_length(NEW.entry_manifest)=0 THEN RAISE EXCEPTION 'empty_manifest'; END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(NEW.entry_manifest) LOOP
  SELECT * INTO r FROM public.knowledge_entry_versions WHERE company_id=NEW.company_id AND id=(m->>'revision_id')::uuid AND entry_id=(m->>'entry_id')::uuid AND revision=(m->>'revision')::integer AND review_status='approved';
  IF r.id IS NULL THEN RAISE EXCEPTION 'unavailable_revision'; END IF;
 END LOOP;
 actual:=private.assemble_snapshot(NEW.company_id,NEW.id,NEW.version_number,NEW.created_at,NEW.author_id);
 IF actual<>NEW.payload THEN RAISE EXCEPTION 'snapshot_payload_mismatch'; END IF;
 IF NEW.payload_sha256<>encode(public.digest(convert_to(private.canonical_json(NEW.payload),'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'snapshot_hash_mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.publish_knowledge_base(p_company uuid,p_expected_generation bigint,p_request uuid) RETURNS public.knowledge_base_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); r public.knowledge_base_versions; i uuid:=gen_random_uuid(); ts timestamptz:=clock_timestamp(); payload jsonb; manifest jsonb;
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 SELECT * INTO r FROM public.knowledge_base_versions WHERE company_id=p_company AND request_id=p_request;
 IF r.id IS NOT NULL THEN
  IF r.entry_manifest->0->>'expected_generation' IS DISTINCT FROM p_expected_generation::text THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN r;
 END IF;
 IF c.draft_generation IS DISTINCT FROM p_expected_generation THEN RAISE EXCEPTION 'stale_generation' USING DETAIL=jsonb_build_object('currentGeneration',c.draft_generation)::text; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('entry_id',e.id,'revision_id',v.id,'revision',v.revision,'expected_generation',p_expected_generation) ORDER BY e.created_at,e.id),'[]') INTO manifest FROM public.knowledge_entries e JOIN public.knowledge_entry_versions v ON v.company_id=e.company_id AND v.entry_id=e.id AND v.revision=e.current_revision WHERE e.company_id=p_company AND e.archived_at IS NULL AND v.review_status='approved';
 payload:=private.assemble_snapshot(p_company,i,c.next_snapshot_version,ts,auth.uid());
 INSERT INTO public.knowledge_base_versions(id,company_id,version_number,request_id,author_id,created_at,entry_manifest,payload,payload_sha256) VALUES(i,p_company,c.next_snapshot_version,p_request,auth.uid(),ts,manifest,payload,encode(public.digest(convert_to(private.canonical_json(payload),'UTF8'),'sha256'),'hex')) RETURNING * INTO r;
 UPDATE public.companies SET next_snapshot_version=next_snapshot_version+1 WHERE id=p_company; RETURN r;
END $$;
CREATE OR REPLACE FUNCTION private.claim_job(p_worker_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies; j public.scrape_jobs;
BEGIN
 IF length(btrim(p_worker_id)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 LOOP
  SELECT co.* INTO c FROM public.companies co WHERE EXISTS(SELECT FROM public.scrape_jobs sj WHERE sj.company_id=co.id AND sj.status IN ('queued','validating','crawling','extracting') AND sj.next_attempt_at<=now() AND (sj.lease_expires_at IS NULL OR sj.lease_expires_at<now())) ORDER BY co.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO j FROM public.scrape_jobs WHERE company_id=c.id AND status IN ('queued','validating','crawling','extracting') AND next_attempt_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<now()) FOR UPDATE;
  IF c.archived_at IS NOT NULL OR j.cancel_requested_at IS NOT NULL OR NOT EXISTS(SELECT FROM public.company_members WHERE company_id=c.id AND user_id=j.requested_by AND role IN ('owner','editor')) OR j.attempt_count>=3 THEN
   UPDATE public.scrape_jobs SET status=CASE WHEN j.attempt_count>=3 THEN 'failed' ELSE 'cancelled' END,finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=j.id; CONTINUE;
  END IF;
  UPDATE public.scrape_jobs SET lease_token=gen_random_uuid(),lease_expires_at=now()+interval '60 seconds',heartbeat_at=now(),attempt_count=attempt_count+1,started_at=coalesce(started_at,now()),status=CASE WHEN status='queued' THEN 'validating' ELSE status END,updated_at=now() WHERE id=j.id RETURNING * INTO j; RETURN to_jsonb(j)||jsonb_build_object('source_captures',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at,s.id),'[]') FROM public.source_pages s WHERE s.company_id=j.company_id AND s.scrape_job_id=j.id),'current_entries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'current_revision',e.current_revision,'content',r.content) ORDER BY e.created_at,e.id),'[]') FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=j.company_id AND e.archived_at IS NULL));
 END LOOP;
END $$;
CREATE FUNCTION public.archive_entry(p_company uuid,p_entry uuid,p_expected_revision integer,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); e public.knowledge_entries;
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 SELECT * INTO e FROM public.knowledge_entries WHERE company_id=p_company AND id=p_entry;
 IF e.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF e.archived_at IS NOT NULL THEN
  -- The same request repeated gets the same answer; anyone else finds nothing there.
  IF e.archive_request_id IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'unavailable'; END IF;
  IF e.current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN jsonb_build_object('id',e.id,'kind',e.kind,'revision',e.current_revision,'archived_at',to_char(e.archived_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 END IF;
 IF e.kind NOT IN ('key_person','offering') THEN RAISE EXCEPTION 'invalid_entry_kind'; END IF;
 IF EXISTS(SELECT FROM public.knowledge_entries WHERE company_id=p_company AND archive_request_id=p_request)
  OR EXISTS(SELECT FROM public.knowledge_entry_versions v,jsonb_array_elements(v.provenance->'operations') o WHERE v.company_id=p_company AND o->>'request_id'=p_request::text) THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
 IF e.current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'stale_revision' USING DETAIL=jsonb_build_object('currentRevision',e.current_revision)::text; END IF;
 UPDATE public.knowledge_entries SET archived_at=now(),archived_by=auth.uid(),archive_request_id=p_request WHERE company_id=p_company AND id=p_entry RETURNING * INTO e;
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company;
 RETURN jsonb_build_object('id',e.id,'kind',e.kind,'revision',e.current_revision,'archived_at',to_char(e.archived_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;
GRANT EXECUTE ON FUNCTION public.archive_entry(uuid,uuid,integer,uuid) TO authenticated;
COMMIT;
