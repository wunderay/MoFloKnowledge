-- Undo of a deletion. A deleted key person or offering is only archived (0020), so bringing it back is clearing its tombstone:
-- the entry returns with every revision and all of its evidence, and a create with the same id (which would collide with
-- the archived row) is not needed. public.restore_entry is the only way back; the tombstone is still immutable to any
-- direct write.
--  * owner or editor of a live company (a non-member finds nothing, a viewer is forbidden, an archived company is refused);
--  * the entry must be archived (otherwise it is refused: not_archived);
--  * the company's draft generation moves, as it does for a deletion.
BEGIN;
SET ROLE moflo_owner;
CREATE OR REPLACE FUNCTION private.identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='knowledge_entries' THEN
  IF (to_jsonb(NEW)-'current_revision'-'archived_at'-'archived_by'-'archive_request_id') IS DISTINCT FROM (to_jsonb(OLD)-'current_revision'-'archived_at'-'archived_by'-'archive_request_id') THEN RAISE EXCEPTION 'immutable_identity'; END IF;
  -- Only repeatable entries are ever archived, whichever statement tries to.
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND OLD.kind NOT IN ('key_person','offering') THEN RAISE EXCEPTION 'invalid_entry_kind'; END IF;
  -- A tombstone is permanent: once archived, nothing about the entry changes again.
  -- The one way back is public.restore_entry, which says so for its own transaction and clears the whole tombstone.
  IF OLD.archived_at IS NOT NULL AND (NEW.archived_at,NEW.archived_by,NEW.archive_request_id,NEW.current_revision) IS DISTINCT FROM (OLD.archived_at,OLD.archived_by,OLD.archive_request_id,OLD.current_revision)
   AND NOT (coalesce(current_setting('private.restoring_entry',true),'')=OLD.id::text AND NEW.archived_at IS NULL AND NEW.archived_by IS NULL AND NEW.archive_request_id IS NULL AND NEW.current_revision=OLD.current_revision) THEN RAISE EXCEPTION 'immutable_identity'; END IF;
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
CREATE FUNCTION public.restore_entry(p_company uuid,p_entry uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.companies:=private.lock_company(p_company); e public.knowledge_entries;
BEGIN
 SELECT * INTO e FROM public.knowledge_entries WHERE company_id=p_company AND id=p_entry;
 IF e.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF e.archived_at IS NULL THEN RAISE EXCEPTION 'not_archived'; END IF;
 PERFORM set_config('private.restoring_entry',p_entry::text,true);
 UPDATE public.knowledge_entries SET archived_at=NULL,archived_by=NULL,archive_request_id=NULL WHERE company_id=p_company AND id=p_entry RETURNING * INTO e;
 PERFORM set_config('private.restoring_entry','',true);
 UPDATE public.companies SET draft_generation=draft_generation+1 WHERE id=p_company;
 RETURN jsonb_build_object('id',e.id,'kind',e.kind,'revision',e.current_revision);
END $$;
GRANT EXECUTE ON FUNCTION public.restore_entry(uuid,uuid) TO authenticated;
COMMIT;
