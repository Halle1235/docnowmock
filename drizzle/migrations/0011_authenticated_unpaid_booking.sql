ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS identification_type text, ADD COLUMN IF NOT EXISTS emirates_id text, ADD COLUMN IF NOT EXISTS contact_email text;
CREATE OR REPLACE FUNCTION public.book_unpaid_consultation(_intake jsonb, _reason jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public
AS $$
DECLARE patient uuid:=auth.uid(); visit_id uuid; birth date; name text:=btrim(_intake->>'fullName'); contact text:=btrim(_intake->>'email'); phone text:=btrim(coalesce(_intake->>'phone','')); identity_type text:=_intake->'identity'->>'type'; identity_number text:=btrim(coalesce(_intake->'identity'->>'number','')); category text:=_reason->>'category'; description text:=btrim(_reason->>'description');
BEGIN
 IF patient IS NULL OR NOT public.has_role(patient,'patient') OR public.has_role(patient,'doctor') OR public.has_role(patient,'admin') THEN RAISE EXCEPTION 'Patient account required' USING ERRCODE='42501'; END IF;
 IF name IS NULL OR length(name) NOT BETWEEN 2 AND 120 OR contact IS NULL OR length(contact)>255 OR contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR (phone<>'' AND phone !~ '^\+[1-9][0-9]{6,14}$') THEN RAISE EXCEPTION 'Invalid contact details' USING ERRCODE='22023'; END IF;
 IF (_intake->>'dateOfBirth') IS NULL OR (_intake->>'dateOfBirth') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid date of birth' USING ERRCODE='22023'; END IF;
 birth:=(_intake->>'dateOfBirth')::date;
 IF birth<DATE '1900-01-01' OR birth>CURRENT_DATE THEN RAISE EXCEPTION 'Invalid date of birth' USING ERRCODE='22023'; END IF;
 IF identity_type IS NULL OR identity_type NOT IN ('resident','visitor') OR (identity_type='resident' AND identity_number<>'' AND identity_number !~ '^784-[0-9]{4}-[0-9]{7}-[0-9]$') OR (identity_type='visitor' AND identity_number !~ '^[A-Za-z0-9 -]{3,32}$') THEN RAISE EXCEPTION 'Invalid identification' USING ERRCODE='22023'; END IF;
 IF category IS NULL OR category NOT IN ('respiratory','skin','urgent-gp','digestive','mental','urinary','pain','allergies','sexual','womens','children','general') OR description IS NULL OR length(description) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid medical reason' USING ERRCODE='22023'; END IF;
 IF (_reason->'emergency') IS DISTINCT FROM 'true'::jsonb OR (_reason->'telehealth') IS DISTINCT FROM 'true'::jsonb OR (_reason->'privacy') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'All patient consents are required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(patient::text,0));
 SELECT id INTO visit_id FROM public.consultations WHERE patient_id=patient AND status IN ('pending','claimed','in_progress') ORDER BY created_at DESC LIMIT 1;
 IF visit_id IS NOT NULL THEN RETURN visit_id; END IF;
 UPDATE public.profiles SET full_name=name,contact_email=contact,phone=nullif(phone,''),date_of_birth=birth::text,identification_type=identity_type,emirates_id=CASE WHEN identity_type='resident' THEN nullif(identity_number,'') ELSE NULL END,passport_number=CASE WHEN identity_type='visitor' THEN identity_number ELSE NULL END WHERE id=patient;
 IF NOT FOUND THEN RAISE EXCEPTION 'Patient profile missing' USING ERRCODE='42501'; END IF;
 INSERT INTO public.consultations(patient_id,status,payment_status,payment_amount,reason_category,reason_description,telehealth_consent_at,privacy_consent_at,emergency_disclaimer_ack_at,consent_version)
 VALUES(patient,'pending','pending',249,category,description,now(),now(),now(),'2026-11-v1') RETURNING id INTO visit_id;
 RETURN visit_id;
END $$;
REVOKE ALL ON FUNCTION public.book_unpaid_consultation(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.book_unpaid_consultation(jsonb,jsonb) TO authenticated;