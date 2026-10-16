BEGIN;
SET ROLE moflo_owner;
-- JSON canonical form matches recursively sorted JS JSON.stringify encoding.
CREATE FUNCTION private.canonical_json(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE r text;
BEGIN
 CASE jsonb_typeof(v)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||private.canonical_json(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO r FROM jsonb_each(v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(private.canonical_json(value),',' ORDER BY ord),'')||']' INTO r FROM jsonb_array_elements(v) WITH ORDINALITY a(value,ord);
 ELSE r:=v::text; END CASE; RETURN r;
END $$;
CREATE FUNCTION private.validate_json(v jsonb,s jsonb,p text DEFAULT '') RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; x jsonb; q jsonb; t text; success boolean:=false;
BEGIN
 IF s ? '$ref' THEN RAISE EXCEPTION 'unresolved_schema_ref'; END IF;
 IF s ? 'anyOf' THEN
  FOR q IN SELECT value FROM jsonb_array_elements(s->'anyOf') LOOP
   BEGIN PERFORM private.validate_json(v,q,p); success:=true; EXIT; EXCEPTION WHEN raise_exception THEN NULL; END;
  END LOOP;
  IF NOT success THEN RAISE EXCEPTION 'invalid_json:%',p; END IF; RETURN;
 END IF;
 IF s ? 'enum' AND NOT s->'enum' @> jsonb_build_array(v) THEN RAISE EXCEPTION 'invalid_enum:%',p; END IF;
 t:=s->>'type';
 IF t='integer' THEN IF jsonb_typeof(v)<>'number' OR (v::text)::numeric<>trunc((v::text)::numeric) THEN RAISE EXCEPTION 'invalid_integer:%',p; END IF;
 ELSIF t IS NOT NULL AND jsonb_typeof(v)<>t THEN RAISE EXCEPTION 'invalid_type:%',p; END IF;
 IF jsonb_typeof(v)='object' THEN
  FOR k IN SELECT jsonb_array_elements_text(coalesce(s->'required','[]')) LOOP IF NOT v ? k THEN RAISE EXCEPTION 'missing_key:%/%',p,k; END IF; END LOOP;
  FOR k,x IN SELECT * FROM jsonb_each(v) LOOP
   IF s->'properties' ? k THEN PERFORM private.validate_json(x,s->'properties'->k,p||'/'||k);
   ELSIF s->'additionalProperties'='false'::jsonb THEN RAISE EXCEPTION 'unknown_key:%/%',p,k; END IF;
  END LOOP;
 ELSIF jsonb_typeof(v)='array' THEN
  IF jsonb_array_length(v)>coalesce((s->>'maxItems')::integer,500) THEN RAISE EXCEPTION 'array_limit:%',p; END IF;
  IF jsonb_array_length(v)<coalesce((s->>'minItems')::integer,0) THEN RAISE EXCEPTION 'array_min:%',p; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP IF s ? 'items' THEN PERFORM private.validate_json(x,s->'items',p||'/*'); END IF; END LOOP;
 ELSIF jsonb_typeof(v)='string' THEN
  k:=v#>>'{}';
  IF length(k)>coalesce((s->>'maxLength')::integer,20000) OR length(k)<coalesce((s->>'minLength')::integer,0) THEN RAISE EXCEPTION 'string_limit:%',p; END IF;
  IF s ? 'pattern' AND k !~ (s->>'pattern') THEN RAISE EXCEPTION 'string_pattern:%',p; END IF;
  IF s->>'format'='uuid' AND k !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN RAISE EXCEPTION 'invalid_uuid:%',p; END IF;
  IF s->>'format' IN ('uri','url') AND NOT private.valid_url(k) THEN RAISE EXCEPTION 'invalid_url:%',p; END IF;
  IF s->>'format'='date-time' THEN PERFORM k::timestamptz; END IF;
  IF s->>'format'='date' THEN PERFORM k::date; END IF;
 ELSIF jsonb_typeof(v)='number' THEN
  IF s ? 'exclusiveMinimum' AND (v::text)::numeric<=(s->>'exclusiveMinimum')::numeric THEN RAISE EXCEPTION 'number_range:%',p; END IF;
  IF s ? 'minimum' AND (v::text)::numeric<(s->>'minimum')::numeric OR s ? 'maximum' AND (v::text)::numeric>(s->>'maximum')::numeric THEN RAISE EXCEPTION 'number_range:%',p; END IF;
 END IF;
END $$;
-- Stable pointers resolve @UUID array members, never positional business indices.
CREATE FUNCTION private.resolve_pointer(v jsonb,p text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; a jsonb:=v;
BEGIN
 IF left(p,1)<>'/' THEN RAISE EXCEPTION 'invalid_pointer'; END IF;
 FOREACH k IN ARRAY string_to_array(substr(p,2),'/') LOOP
  k:=replace(replace(k,'~1','/'),'~0','~');
  IF jsonb_typeof(a)='array' THEN
   IF k ~ '^@' THEN SELECT value INTO a FROM jsonb_array_elements(a) WHERE value->>'id'=substr(k,2);
   ELSIF k ~ '^[0-9]+$' AND NOT EXISTS(SELECT FROM jsonb_array_elements(a) item WHERE jsonb_typeof(item)='object') THEN a:=a->k::integer; ELSE a:=NULL; END IF;
  ELSE a:=a->k; END IF;
  IF a IS NULL THEN RAISE EXCEPTION 'unknown_pointer:%',p; END IF;
 END LOOP; RETURN a;
END $$;
CREATE FUNCTION private.business_leaves(v jsonb,p text) RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; x jsonb; n integer:=0; ids text[]:='{}';
BEGIN
 IF v='null'::jsonb THEN RETURN; END IF;
 CASE jsonb_typeof(v)
 WHEN 'object' THEN FOR k,x IN SELECT * FROM jsonb_each(v) LOOP IF k<>'id' THEN RETURN QUERY SELECT * FROM private.business_leaves(x,p||'/'||replace(replace(k,'~','~0'),'/','~1')); END IF; END LOOP;
 WHEN 'array' THEN FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP
  IF jsonb_typeof(x)='object' THEN
   k:=x->>'id'; IF k IS NULL OR k=ANY(ids) THEN RAISE EXCEPTION 'missing_or_duplicate_item_id'; END IF; ids:=array_append(ids,k); k:='@'||k;
  ELSE k:=n::text; END IF;
  RETURN QUERY SELECT * FROM private.business_leaves(x,p||'/'||k); n:=n+1;
 END LOOP;
 ELSE IF v<>'""'::jsonb THEN RETURN NEXT p; END IF;
 END CASE;
END $$;
CREATE FUNCTION private.validate_evidence(p_company uuid,p_provenance jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e jsonb; s jsonb; r public.source_pages;
BEGIN
 FOR s IN SELECT value FROM jsonb_array_elements(coalesce(p_provenance->'sources','[]')) LOOP
  SELECT * INTO r FROM public.source_pages WHERE company_id=p_company AND id=(s->>'id')::uuid AND capture_status='captured';
  IF r.id IS NULL OR s->>'url' IS DISTINCT FROM r.final_url OR (s->>'retrieved_at')::timestamptz IS DISTINCT FROM r.retrieved_at THEN RAISE EXCEPTION 'unavailable_source'; END IF;
  IF (s->>'title',s->>'author',s->>'site_name',(s->>'published_on')::date) IS DISTINCT FROM (r.title,r.author,r.site_name,r.published_on) THEN RAISE EXCEPTION 'source_metadata_mismatch'; END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_provenance->'evidence','[]')) LOOP
  SELECT * INTO r FROM public.source_pages WHERE company_id=p_company AND id=(e->>'source_page_id')::uuid AND capture_status='captured';
  IF r.id IS NULL OR NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_provenance->'sources','[]')) x WHERE x->>'id'=r.id::text) THEN RAISE EXCEPTION 'unavailable_source'; END IF;
  IF e->>'kind'='text' THEN
   IF e->'technical'<>'null'::jsonb THEN RAISE EXCEPTION 'text_evidence_technical_metadata'; END IF;
   IF coalesce(e->>'excerpt','')='' OR NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(r.observations->'segments','[]')) seg WHERE position(e->>'excerpt' IN coalesce(seg->>'text',''))>0) THEN RAISE EXCEPTION 'unsupported_excerpt'; END IF;
  ELSIF e->>'kind'='technical' THEN
   IF e->'technical'='null'::jsonb OR NOT EXISTS(SELECT FROM jsonb_each(e->'technical') t WHERE t.value<>'null'::jsonb) THEN RAISE EXCEPTION 'empty_technical_evidence'; END IF;
   IF NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(r.design_evidence->'observations','[]')) t WHERE t @> (e->'technical')) THEN RAISE EXCEPTION 'unsupported_technical_evidence'; END IF;
  ELSE RAISE EXCEPTION 'invalid_evidence_kind'; END IF;
 END LOOP;
END $$;
COMMIT;
