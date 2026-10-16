BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION public.enqueue_scrape(p_company uuid,p_url text,p_options jsonb,p_request uuid) RETURNS public.scrape_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs; options jsonb:=coalesce(p_options,'{"max_pages":10,"max_depth":2}');
BEGIN
 IF p_request IS NULL OR NOT private.valid_url(p_url) OR jsonb_typeof(options)<>'object' OR options-ARRAY['max_pages','max_depth']<>'{}' OR NOT options ?& ARRAY['max_pages','max_depth'] OR jsonb_typeof(options->'max_pages')<>'number' OR jsonb_typeof(options->'max_depth')<>'number' OR (options->>'max_pages')::numeric<>trunc((options->>'max_pages')::numeric) OR (options->>'max_depth')::numeric<>trunc((options->>'max_depth')::numeric) OR (options->>'max_pages')::integer NOT BETWEEN 1 AND 25 OR (options->>'max_depth')::integer NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'invalid_scrape'; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND request_id=p_request;
 IF j.id IS NOT NULL THEN IF (j.requested_url,j.options) IS DISTINCT FROM (p_url,options) THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN j; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND status IN ('queued','validating','crawling','extracting');
 IF j.id IS NOT NULL THEN RAISE EXCEPTION 'active_job' USING DETAIL=jsonb_build_object('activeJobId',j.id)::text; END IF;
 IF (SELECT count(*) FROM public.scrape_jobs WHERE company_id=p_company AND created_at>now()-interval '1 hour')>=10 OR (SELECT count(*) FROM public.scrape_jobs WHERE requested_by=auth.uid() AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'rate_limited'; END IF;
 INSERT INTO public.scrape_jobs(company_id,requested_by,request_id,requested_url,options) VALUES(p_company,auth.uid(),p_request,p_url,options) RETURNING * INTO j; RETURN j;
END $$;
CREATE FUNCTION public.cancel_scrape(p_company uuid,p_job uuid) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs;
BEGIN
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF j.status IN ('queued','validating','crawling','extracting') THEN
  UPDATE public.scrape_jobs SET cancel_requested_at=coalesce(cancel_requested_at,now()),status=CASE WHEN lease_token IS NULL THEN 'cancelled' ELSE status END,finished_at=CASE WHEN lease_token IS NULL THEN now() ELSE NULL END,updated_at=now() WHERE id=p_job RETURNING * INTO j;
 END IF; RETURN j;
END $$;
CREATE FUNCTION private.claim_job(p_worker_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  UPDATE public.scrape_jobs SET lease_token=gen_random_uuid(),lease_expires_at=now()+interval '60 seconds',heartbeat_at=now(),attempt_count=attempt_count+1,started_at=coalesce(started_at,now()),status=CASE WHEN status='queued' THEN 'validating' ELSE status END,updated_at=now() WHERE id=j.id RETURNING * INTO j; RETURN to_jsonb(j)||jsonb_build_object('source_captures',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at,s.id),'[]') FROM public.source_pages s WHERE s.company_id=j.company_id AND s.scrape_job_id=j.id));
 END LOOP;
END $$;
CREATE FUNCTION private.worker_job(p_job uuid,p_company uuid,p_lease_token uuid,p_allow_cancel boolean DEFAULT false) RETURNS public.scrape_jobs LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.companies; j public.scrape_jobs;
BEGIN
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR UPDATE;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND id=p_job FOR UPDATE;
 IF c.id IS NULL OR j.id IS NULL OR p_lease_token IS NULL OR j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() OR j.status NOT IN ('validating','crawling','extracting') THEN RAISE EXCEPTION 'invalid_lease'; END IF;
 IF c.archived_at IS NOT NULL OR NOT EXISTS(SELECT FROM public.company_members WHERE company_id=p_company AND user_id=j.requested_by AND role IN ('owner','editor')) THEN RAISE EXCEPTION 'requester_unavailable'; END IF;
 IF j.cancel_requested_at IS NOT NULL AND NOT p_allow_cancel THEN RAISE EXCEPTION 'cancel_requested'; END IF; RETURN j;
END $$;
CREATE FUNCTION private.heartbeat_job(p_job uuid,p_company uuid,p_lease_token uuid) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs:=private.worker_job(p_job,p_company,p_lease_token);
BEGIN UPDATE public.scrape_jobs SET heartbeat_at=now(),lease_expires_at=now()+interval '60 seconds',updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j; END $$;
CREATE FUNCTION private.validate_progress(p_progress jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text; v jsonb;
BEGIN
 IF jsonb_typeof(p_progress)<>'object' THEN RAISE EXCEPTION 'invalid_progress'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_progress) LOOP
  IF k IN ('discovered','selected','captured','failed','blocked','extracted','document_limit') AND (jsonb_typeof(v)<>'number' OR (v::text)::numeric<0 OR (v::text)::numeric>9007199254740991 OR (v::text)::numeric<>trunc((v::text)::numeric)) THEN RAISE EXCEPTION 'invalid_progress_count'; END IF;
  IF k NOT IN ('stage','discovered','selected','captured','failed','blocked','extracted','document_limit','limits_reached') THEN RAISE EXCEPTION 'unknown_progress_key'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.checkpoint_job(p_job uuid,p_company uuid,p_lease_token uuid,p_checkpoint jsonb,p_progress jsonb) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs:=private.worker_job(p_job,p_company,p_lease_token); stage text:=p_progress->>'stage';
BEGIN
 PERFORM private.validate_progress(p_progress);
 IF jsonb_typeof(p_checkpoint)<>'object' OR octet_length(p_checkpoint::text)>1048576 THEN RAISE EXCEPTION 'invalid_checkpoint'; END IF;
 IF stage NOT IN ('validating','crawling','extracting') OR array_position(ARRAY['validating','crawling','extracting'],stage)<array_position(ARRAY['validating','crawling','extracting'],j.status) THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 UPDATE public.scrape_jobs SET checkpoint=p_checkpoint,progress=p_progress,status=stage,updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j;
END $$;
CREATE FUNCTION private.validate_capture() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE seg jsonb; ids text[]:='{}';
BEGIN
 IF NOT private.valid_url(NEW.normalized_url) OR NEW.final_url IS NOT NULL AND NOT private.valid_url(NEW.final_url) THEN RAISE EXCEPTION 'invalid_url'; END IF;
 IF length(coalesce(NEW.cleaned_content,''))>100000 OR octet_length(NEW.observations::text)>1048576 OR octet_length(NEW.design_evidence::text)>1048576 THEN RAISE EXCEPTION 'capture_limit'; END IF;
 IF NEW.capture_status='captured' THEN
  IF NEW.content_sha256<>encode(public.digest(convert_to(NEW.cleaned_content,'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'content_hash_mismatch'; END IF;
  FOR seg IN SELECT value FROM jsonb_array_elements(coalesce(NEW.observations->'segments','[]')) LOOP
   IF seg->>'id' IS NULL OR seg->>'id'=ANY(ids) OR coalesce(seg->>'text','')='' OR position(seg->>'text' IN NEW.cleaned_content)=0 THEN RAISE EXCEPTION 'invalid_segment'; END IF; ids:=ids|| (seg->>'id');
  END LOOP;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER validate_capture BEFORE INSERT ON public.source_pages FOR EACH ROW EXECUTE FUNCTION private.validate_capture();
CREATE FUNCTION private.insert_source_capture(p_job uuid,p_company uuid,p_lease_token uuid,p_capture jsonb) RETURNS public.source_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs:=private.worker_job(p_job,p_company,p_lease_token); s public.source_pages; old public.source_pages;
BEGIN
 IF jsonb_typeof(p_capture)<>'object' OR p_capture-ARRAY['id','normalized_url','final_url','title','author','site_name','published_on','retrieved_at','response_status','capture_status','capture_method','cleaned_content','content_sha256','observations','design_evidence','error_code']<>'{}' THEN RAISE EXCEPTION 'invalid_capture'; END IF;
 s:=jsonb_populate_record(NULL::public.source_pages,p_capture); s.id:=coalesce(s.id,gen_random_uuid()); s.company_id:=p_company; s.scrape_job_id:=p_job; s.recorded_at:=now(); s.observations:=coalesce(s.observations,'{}'); s.design_evidence:=coalesce(s.design_evidence,'{}');
 SELECT * INTO old FROM public.source_pages WHERE company_id=p_company AND scrape_job_id=p_job AND normalized_url=s.normalized_url;
 IF old.id IS NOT NULL THEN
  IF (to_jsonb(old)-ARRAY['id','recorded_at']) IS DISTINCT FROM (to_jsonb(s)-ARRAY['id','recorded_at']) THEN RAISE EXCEPTION 'capture_idempotency_conflict'; END IF; RETURN old;
 END IF;
 INSERT INTO public.source_pages SELECT s.* RETURNING * INTO s; RETURN s;
END $$;
GRANT EXECUTE ON FUNCTION public.enqueue_scrape(uuid,text,jsonb,uuid),public.cancel_scrape(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.claim_job(text),private.heartbeat_job(uuid,uuid,uuid),private.checkpoint_job(uuid,uuid,uuid,jsonb,jsonb),private.insert_source_capture(uuid,uuid,uuid,jsonb) TO moflo_worker;
COMMIT;
