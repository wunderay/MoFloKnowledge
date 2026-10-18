-- Crawl limits are set by the app (CRAWL_MAX_PAGES, CRAWL_MAX_DEPTH, ...), not fixed in the database. enqueue_scrape now only
-- rejects values below the minimum, and the worker checkpoint and progress contracts no longer cap pages, depth or bytes.
-- The app enforces the configured maximums. 0008 and the earlier contract migrations stay frozen.
BEGIN;
SET ROLE moflo_owner;
CREATE OR REPLACE FUNCTION public.enqueue_scrape(p_company uuid,p_url text,p_options jsonb,p_request uuid) RETURNS public.scrape_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); j public.scrape_jobs; options jsonb:=coalesce(p_options,'{"max_pages":10,"max_depth":2}');
BEGIN
 IF p_request IS NULL OR NOT private.valid_url(p_url) OR jsonb_typeof(options)<>'object' OR options-ARRAY['max_pages','max_depth']<>'{}' OR NOT options ?& ARRAY['max_pages','max_depth'] OR jsonb_typeof(options->'max_pages')<>'number' OR jsonb_typeof(options->'max_depth')<>'number' OR (options->>'max_pages')::numeric<>trunc((options->>'max_pages')::numeric) OR (options->>'max_depth')::numeric<>trunc((options->>'max_depth')::numeric) OR (options->>'max_pages')::integer<1 OR (options->>'max_depth')::integer<0 THEN RAISE EXCEPTION 'invalid_scrape'; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND request_id=p_request;
 IF j.id IS NOT NULL THEN IF (j.requested_url,j.options) IS DISTINCT FROM (p_url,options) THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN j; END IF;
 SELECT * INTO j FROM public.scrape_jobs WHERE company_id=p_company AND status IN ('queued','validating','crawling','extracting');
 IF j.id IS NOT NULL THEN RAISE EXCEPTION 'active_job' USING DETAIL=jsonb_build_object('activeJobId',j.id)::text; END IF;
 IF (SELECT count(*) FROM public.scrape_jobs WHERE company_id=p_company AND created_at>now()-interval '1 hour')>=10 OR (SELECT count(*) FROM public.scrape_jobs WHERE requested_by=auth.uid() AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'rate_limited'; END IF;
 INSERT INTO public.scrape_jobs(company_id,requested_by,request_id,requested_url,options) VALUES(p_company,auth.uid(),p_request,p_url,options) RETURNING * INTO j; RETURN j;
END $$;
ALTER FUNCTION private.contract_schema(text) RENAME TO contract_schema_before_crawl_limits;
CREATE FUNCTION private.contract_schema(p_kind text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE
  WHEN p_kind='worker_checkpoint' THEN jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(private.contract_schema_before_crawl_limits(p_kind),'{properties,frontier,properties,pending,items,properties,depth,maximum}','9007199254740991'::jsonb),'{properties,frontier,properties,pending,maxItems}','100000'::jsonb),'{properties,frontier,properties,seen,maxItems}','100000'::jsonb),'{properties,frontier,properties,aliases,maxItems}','100000'::jsonb),'{properties,frontier,properties,selected,maximum}','9007199254740991'::jsonb),'{properties,budgets,properties,documents,maximum}','9007199254740991'::jsonb),'{properties,budgets,properties,htmlBytes,maximum}','9007199254740991'::jsonb),'{properties,budgets,properties,designBytes,maximum}','9007199254740991'::jsonb),'{properties,captured_source_ids,maxItems}','100000'::jsonb),'{properties,extracted_source_ids,maxItems}','100000'::jsonb),'{properties,model_successes,maximum}','9007199254740991'::jsonb),'{properties,model_failures,maximum}','9007199254740991'::jsonb)
  WHEN p_kind='worker_progress' THEN jsonb_set(private.contract_schema_before_crawl_limits(p_kind),'{properties,document_limit,maximum}','9007199254740991'::jsonb)
  ELSE private.contract_schema_before_crawl_limits(p_kind) END
$$;
COMMIT;
