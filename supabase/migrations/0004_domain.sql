BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.business_ids(v jsonb) RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x jsonb;
BEGIN
 IF jsonb_typeof(v)='object' THEN
  IF v ? 'id' THEN RETURN NEXT v->>'id'; END IF;
  FOR x IN SELECT value FROM jsonb_each(v) WHERE key<>'id' LOOP RETURN QUERY SELECT * FROM private.business_ids(x); END LOOP;
 ELSIF jsonb_typeof(v)='array' THEN FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP RETURN QUERY SELECT * FROM private.business_ids(x); END LOOP;
 END IF;
END $$;
CREATE FUNCTION private.allowed_origin(p_target text,p_origin text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE field jsonb;
BEGIN
 SELECT value INTO field FROM jsonb_array_elements(private.field_registry()) WHERE p_target ~ ('^'||replace(value->>'path','/@id','/@[0-9a-fA-F-]{36}')||'(/|$)');
 IF field IS NULL THEN RETURN false; END IF;
 IF p_target ~ '/(ctas|funnels)/' AND p_target !~ '/(purpose|name)$' OR p_target ~ '/fonts/' AND p_target !~ '/apparent_use$' OR p_target ~ '/brand_colors/' AND p_target !~ '/apparent_role$' OR p_target ~ '/logos/' AND p_target !~ '/variant$' THEN RETURN p_origin IN ('source_backed','user_provided'); END IF;
 RETURN field->'allowedOrigins' ? p_origin;
END $$;
CREATE FUNCTION private.validate_domain(p_kind text,v jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e jsonb; p jsonb; c jsonb;
BEGIN
 IF (SELECT count(*) FROM private.business_ids(v))<>(SELECT count(DISTINCT id) FROM private.business_ids(v) id) THEN RAISE EXCEPTION 'duplicate_business_id'; END IF;
 IF p_kind='company_foundation' THEN
  IF v->>'year_founded' IS NOT NULL AND (v->>'year_founded')::integer>extract(year FROM current_date)::integer THEN RAISE EXCEPTION 'invalid_founding_year'; END IF;
  e:=v->'employee_count';
  IF e<>'null'::jsonb THEN
   IF e->>'exact' IS NOT NULL AND (e->>'min' IS NOT NULL OR e->>'max' IS NOT NULL) OR e->>'min' IS NOT NULL AND e->>'max' IS NOT NULL AND (e->>'min')::numeric>(e->>'max')::numeric THEN RAISE EXCEPTION 'invalid_employee_range'; END IF;
  END IF;
 END IF;
 IF p_kind='offering' AND v->'pricing'<>'null'::jsonb THEN
  p:=v->'pricing';
  IF p->>'amount' IS NOT NULL AND (p->>'min_amount' IS NOT NULL OR p->>'max_amount' IS NOT NULL) OR (p->>'min_amount' IS NULL)<>(p->>'max_amount' IS NULL) OR p->>'min_amount' IS NOT NULL AND (p->>'min_amount')::numeric>(p->>'max_amount')::numeric THEN RAISE EXCEPTION 'invalid_pricing_range'; END IF;
  IF p->>'kind' IN ('free','contact_for_pricing') AND (p->>'amount' IS NOT NULL OR p->>'min_amount' IS NOT NULL OR p->>'max_amount' IS NOT NULL) THEN RAISE EXCEPTION 'manufactured_pricing'; END IF;
 END IF;
 IF p_kind='branding_and_style' THEN
  FOR c IN SELECT value FROM jsonb_array_elements(v->'fonts') LOOP
   IF (SELECT count(*) FROM jsonb_array_elements(c->'observations'))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(c->'observations')) OR c->'observations'<>(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements(c->'observations')) THEN RAISE EXCEPTION 'font_observations_not_canonical'; END IF;
  END LOOP;
 END IF;
END $$;
COMMIT;
