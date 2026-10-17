-- An Undo puts list items back with the claims they had. The server carries an item's original (not person-authored)
-- claims over from an earlier revision of the same entry; this lets such a value through the edit-origin check, and only
-- when the very value and the claim's origin, evidence and notes (its id and targets aside) are those of an earlier
-- revision of this entry. Every other edited value still needs a claim of the editing user, or a selected candidate.
BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.restored_leaf(p_company uuid,p_entry uuid,p_kind text,p_leaf text,p_value jsonb,p_provenance jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE c jsonb; v public.knowledge_entry_versions; earlier jsonb;
BEGIN
 FOR c IN SELECT value FROM jsonb_array_elements(p_provenance->'claims') WHERE value->'targets' ? p_leaf AND value->>'origin'<>'user_provided' LOOP
  FOR v IN SELECT h.* FROM public.knowledge_entry_versions h WHERE h.company_id=p_company AND h.entry_id=p_entry LOOP
   IF EXISTS(SELECT FROM jsonb_array_elements(v.provenance->'claims') hc WHERE (hc-'targets'-'id')=(c-'targets'-'id') AND hc->'targets' ? p_leaf) THEN
    BEGIN earlier:=private.resolve_pointer(private.entry_business(p_kind,v.content),p_leaf); EXCEPTION WHEN raise_exception THEN earlier:=NULL; END;
    IF earlier IS NOT NULL AND earlier=p_value THEN RETURN true; END IF;
   END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION private.assert_edit_origin(p_company uuid,p_entry uuid,p_content jsonb,p_provenance jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old public.knowledge_entry_versions; k text; root text; leaf text; previous jsonb; current_value jsonb; old_business jsonb; new_business jsonb;
BEGIN
 SELECT e.kind INTO k FROM public.knowledge_entries e WHERE e.company_id=p_company AND e.id=p_entry;
 SELECT r.* INTO old FROM public.knowledge_entries e JOIN public.knowledge_entry_versions r ON r.company_id=e.company_id AND r.entry_id=e.id AND r.revision=e.current_revision WHERE e.company_id=p_company AND e.id=p_entry;
 root:='/'||private.kind_root(k); IF k IN ('key_person','offering') THEN root:=root||'/@'||p_entry::text; END IF;
 PERFORM private.validate_json(p_content,private.contract_schema(k));
 old_business:=private.entry_business(k,old.content); new_business:=private.entry_business(k,p_content);
 FOR leaf IN SELECT * FROM private.business_leaves(p_content,root) LOOP
  BEGIN previous:=private.resolve_pointer(old_business,leaf); EXCEPTION WHEN raise_exception THEN previous:=NULL; END;
  current_value:=private.resolve_pointer(new_business,leaf);
  IF previous IS DISTINCT FROM current_value AND NOT EXISTS(SELECT FROM jsonb_array_elements(p_provenance->'claims') claim WHERE claim->'targets' ? leaf AND claim->>'origin'='user_provided' AND claim->>'actor_id'=auth.uid()::text) AND NOT private.restored_leaf(p_company,p_entry,k,leaf,current_value,p_provenance) AND NOT EXISTS(
   SELECT FROM jsonb_array_elements(coalesce(p_provenance->'decisions','[]')) decision
   JOIN LATERAL jsonb_array_elements(coalesce(old.provenance->'conflicts','[]')) conflict ON conflict->>'id'=decision->>'conflict_id' AND conflict->>'target'=decision->>'target'
   JOIN LATERAL jsonb_array_elements(conflict->'candidates') candidate ON candidate->>'id'=decision->>'candidate_id'
   WHERE decision->>'action'='select' AND decision->>'actor_id'=auth.uid()::text
    AND (leaf=decision->>'target' OR left(leaf,length(decision->>'target')+1)=(decision->>'target')||'/')
    AND private.resolve_pointer(new_business,decision->>'target')=candidate->'value'
    AND EXISTS(SELECT FROM jsonb_array_elements(p_provenance->'claims') claim WHERE claim->'targets' ? leaf AND claim->>'origin'=candidate->>'origin' AND claim->'evidence_ids'=candidate->'evidence_ids' AND claim->'based_on_claim_ids'=candidate->'based_on_claim_ids')
  ) THEN RAISE EXCEPTION 'edited_leaf_requires_user_origin:%',leaf; END IF;
 END LOOP;
END $$;
COMMIT;
