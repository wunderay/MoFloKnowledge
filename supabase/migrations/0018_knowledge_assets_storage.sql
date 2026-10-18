BEGIN;
-- Private Supabase Storage bucket `knowledge-assets` (logos, portraits, offering images)
-- and the `uploads` metadata the app serves them by. Object names are <kind>/<company uuid>/<uuid>.<ext>; access
-- is decided by the company in the second path segment, through the same membership data as the rest of the schema.
SET ROLE moflo_owner;

-- The company a storage object name belongs to, or NULL for any name that is not exactly the canonical shape.
-- Nothing is cast unless the segment already matches the uuid pattern, so a malformed name can never raise.
CREATE FUNCTION private.asset_company(p_name text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_name ~ '^(logos|portraits|offering-images)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|gif|webp|svg)$'
  THEN split_part(p_name,'/',2)::uuid END
$$;
-- Read: any member. Write: owner or editor of a company that is not archived. Evaluated per call, so removing a
-- member or archiving a company takes effect immediately.
CREATE FUNCTION private.asset_access(p_name text,p_write boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.company_members m JOIN public.companies c ON c.id=m.company_id
  WHERE c.id=private.asset_company(p_name) AND m.user_id=auth.uid()
   AND (NOT p_write OR (m.role IN ('owner','editor') AND c.archived_at IS NULL)))
$$;
REVOKE ALL ON FUNCTION private.asset_company(text),private.asset_access(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.asset_company(text),private.asset_access(text,boolean) TO authenticated;

CREATE TABLE public.uploads (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('logos','portraits','offering-images')),
  path text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/gif','image/webp','image/svg+xml')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_with(path,kind||'/'||company_id::text||'/'))
);
CREATE INDEX uploads_company_idx ON public.uploads(company_id);
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uploads FROM PUBLIC, anon, authenticated, moflo_worker;
GRANT SELECT, INSERT, DELETE ON public.uploads TO authenticated;
CREATE POLICY tenant_read ON public.uploads FOR SELECT TO authenticated
 USING (private.company_role(company_id) IS NOT NULL);
CREATE POLICY uploads_insert ON public.uploads FOR INSERT TO authenticated
 WITH CHECK (created_by=auth.uid() AND private.asset_company(path)=company_id AND private.asset_access(path,true));
CREATE POLICY uploads_delete ON public.uploads FOR DELETE TO authenticated
 USING (private.asset_access(path,true));

-- Storage objects belong to the Storage service, so the bucket row and its policies are written by the migration
-- administrator rather than moflo_owner.
RESET ROLE;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('knowledge-assets','knowledge-assets',false,10485760,ARRAY['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- Signed-in users only, this bucket only. No UPDATE policy: objects are never overwritten, renamed or moved.
CREATE POLICY knowledge_assets_read ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='knowledge-assets' AND private.asset_access(name,false));
CREATE POLICY knowledge_assets_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='knowledge-assets' AND private.asset_access(name,true));
CREATE POLICY knowledge_assets_delete ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='knowledge-assets' AND private.asset_access(name,true));
COMMIT;
