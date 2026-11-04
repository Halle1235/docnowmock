ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allergies text;

-- Doctors get only what they need for a consultation they can see:
-- name, phone, age (not date of birth or passport), allergies.
CREATE OR REPLACE FUNCTION public.get_consultation_patient(_consultation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c record; p record; age int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'doctor') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM consultations
   WHERE id = _consultation_id AND (status = 'pending' OR doctor_id = auth.uid());
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT full_name, phone, date_of_birth, allergies INTO p FROM profiles WHERE id = c.patient_id;
  BEGIN
    age := date_part('year', age(current_date, p.date_of_birth::date))::int;
  EXCEPTION WHEN others THEN
    age := NULL;
  END;
  RETURN jsonb_build_object('full_name', p.full_name, 'phone', p.phone, 'age', age, 'allergies', p.allergies);
END $$;

REVOKE ALL ON FUNCTION public.get_consultation_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_consultation_patient(uuid) TO authenticated;