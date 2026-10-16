BEGIN;
-- Auth owns its RLS-protected user table. Domain operations use the existing
-- Auth foreign keys to validate identity without reading the Auth roster.
REVOKE SELECT(id) ON auth.users FROM moflo_owner;
SET ROLE moflo_owner;
CREATE OR REPLACE FUNCTION public.set_company_member(p_company uuid,p_user uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company,true); existing_role text;
BEGIN
 IF p_user IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF p_role IS NOT NULL AND p_role NOT IN ('owner','editor','viewer') THEN RAISE EXCEPTION 'invalid_role'; END IF;
 SELECT role INTO existing_role FROM public.company_members WHERE company_id=p_company AND user_id=p_user;
 IF p_role IS DISTINCT FROM 'owner' AND existing_role='owner' AND (SELECT count(*) FROM public.company_members WHERE company_id=p_company AND role='owner')<=1 THEN RAISE EXCEPTION 'last_owner'; END IF;
 BEGIN
  IF p_role IS NULL THEN
   -- For a non-member, insert/remove within the same transaction to check the
   -- Auth FK while preserving idempotent removal and exposing no Auth rows.
   IF existing_role IS NULL THEN
    INSERT INTO public.company_members(company_id,user_id,role,added_by) VALUES(p_company,p_user,'viewer',auth.uid());
   END IF;
   DELETE FROM public.company_members WHERE company_id=p_company AND user_id=p_user;
  ELSE
   INSERT INTO public.company_members(company_id,user_id,role,added_by) VALUES(p_company,p_user,p_role,auth.uid())
    ON CONFLICT(company_id,user_id) DO UPDATE SET role=excluded.role;
  END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION 'unavailable';
 END;
END $$;
GRANT EXECUTE ON FUNCTION public.set_company_member(uuid,uuid,text) TO authenticated;
COMMIT;
