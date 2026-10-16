BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.company_role(p_company uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT role FROM public.company_members WHERE company_id=p_company AND user_id=auth.uid()
$$;
CREATE FUNCTION private.lock_company(p_company uuid,p_owner boolean DEFAULT false)
RETURNS public.companies LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies; r text;
BEGIN
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR UPDATE;
 r:=private.company_role(p_company);
 IF c.id IS NULL OR r IS NULL THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='P0002'; END IF;
 IF r NOT IN ('owner','editor') OR (p_owner AND r<>'owner') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'company_archived'; END IF;
 RETURN c;
END $$;
CREATE FUNCTION private.immutable_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'immutable_record' USING ERRCODE='42501'; END $$;
CREATE FUNCTION private.identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='knowledge_entries' AND (to_jsonb(NEW)-'current_revision') IS DISTINCT FROM (to_jsonb(OLD)-'current_revision') THEN RAISE EXCEPTION 'immutable_identity'; END IF;
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
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['source_pages','knowledge_entry_versions','knowledge_base_versions'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.immutable_record()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['companies','company_members','knowledge_entries'] LOOP
  EXECUTE format('CREATE TRIGGER identity_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.identity_guard()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['companies','company_members','scrape_jobs','source_pages','knowledge_entries','knowledge_entry_versions','knowledge_base_versions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, moflo_worker',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(private.company_role(%I) IS NOT NULL)',t,CASE WHEN t='companies' THEN 'id' ELSE 'company_id' END);
 END LOOP;
END $$;
CREATE POLICY companies_rename ON public.companies FOR UPDATE TO authenticated
 USING(private.company_role(id) IN ('owner','editor') AND archived_at IS NULL)
 WITH CHECK(private.company_role(id) IN ('owner','editor') AND archived_at IS NULL);
GRANT UPDATE(name) ON public.companies TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated,moflo_worker;
GRANT EXECUTE ON FUNCTION private.company_role(uuid) TO authenticated;
CREATE FUNCTION private.valid_url(p_url text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_url IS NOT NULL AND length(p_url)<=4096 AND p_url ~ '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$' AND p_url !~ '[[:cntrl:]]'
$$;
CREATE FUNCTION public.create_company(p_name text,p_website text,p_request uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); c uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;
 IF p_request IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 OR NOT private.valid_url(p_website) THEN RAISE EXCEPTION 'invalid_company'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 SELECT id INTO c FROM public.companies WHERE created_by=u AND creation_request_id=p_request AND name=p_name AND website_url=p_website;
 IF c IS NOT NULL THEN RETURN c; END IF;
 IF EXISTS(SELECT FROM public.companies WHERE created_by=u AND creation_request_id=p_request) THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
 IF (SELECT count(*) FROM public.companies WHERE created_by=u AND archived_at IS NULL)>=100 THEN RAISE EXCEPTION 'rate_limited'; END IF;
 INSERT INTO public.companies(name,website_url,created_by,creation_request_id) VALUES(p_name,p_website,u,p_request) RETURNING id INTO c;
 INSERT INTO public.company_members(company_id,user_id,role,added_by) VALUES(c,u,'owner',u);
 RETURN c;
END $$;
CREATE FUNCTION public.update_company(p_company uuid,p_expected_generation bigint,p_name text DEFAULT NULL,p_website text DEFAULT NULL) RETURNS public.companies
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company);
BEGIN
 IF c.draft_generation<>p_expected_generation THEN RAISE EXCEPTION 'stale_generation' USING DETAIL=jsonb_build_object('currentGeneration',c.draft_generation)::text; END IF;
 IF p_website IS NOT NULL AND NOT private.valid_url(p_website) THEN RAISE EXCEPTION 'invalid_url'; END IF;
 UPDATE public.companies SET name=coalesce(p_name,name),website_url=coalesce(p_website,website_url) WHERE id=p_company RETURNING * INTO c; RETURN c;
END $$;
CREATE FUNCTION public.archive_company(p_company uuid,p_expected_generation bigint) RETURNS public.companies
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company,true);
BEGIN
 IF c.draft_generation<>p_expected_generation THEN RAISE EXCEPTION 'stale_generation' USING DETAIL=jsonb_build_object('currentGeneration',c.draft_generation)::text; END IF;
 UPDATE public.companies SET archived_at=now(),draft_generation=draft_generation+1 WHERE id=p_company RETURNING * INTO c;
 UPDATE public.scrape_jobs SET status='cancelled',cancel_requested_at=now(),finished_at=now(),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE company_id=p_company AND status IN ('queued','validating','crawling','extracting'); RETURN c;
END $$;
CREATE FUNCTION public.set_company_member(p_company uuid,p_user uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company,true);
BEGIN
 IF NOT EXISTS(SELECT FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF p_role IS NOT NULL AND p_role NOT IN ('owner','editor','viewer') THEN RAISE EXCEPTION 'invalid_role'; END IF;
 IF p_role IS DISTINCT FROM 'owner' AND EXISTS(SELECT FROM public.company_members WHERE company_id=p_company AND user_id=p_user AND role='owner') AND (SELECT count(*) FROM public.company_members WHERE company_id=p_company AND role='owner')<=1 THEN RAISE EXCEPTION 'last_owner'; END IF;
 IF p_role IS NULL THEN DELETE FROM public.company_members WHERE company_id=p_company AND user_id=p_user;
 ELSE INSERT INTO public.company_members(company_id,user_id,role,added_by) VALUES(p_company,p_user,p_role,auth.uid()) ON CONFLICT(company_id,user_id) DO UPDATE SET role=excluded.role; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.create_company(text,text,uuid),public.update_company(uuid,bigint,text,text),public.archive_company(uuid,bigint),public.set_company_member(uuid,uuid,text) TO authenticated;
COMMIT;
