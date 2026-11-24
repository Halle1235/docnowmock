-- Standalone additive migration. Apply independently of the pending booking/video migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.visit_feedback (
  consultation_id uuid PRIMARY KEY REFERENCES public.consultations(id) ON DELETE RESTRICT,
  doctor_rating smallint NOT NULL CHECK (doctor_rating BETWEEN 1 AND 5),
  video_rating smallint NOT NULL CHECK (video_rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.visit_feedback FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_visit_feedback(
  _consultation_id uuid, _doctor_rating integer, _video_rating integer, _comment text DEFAULT ''
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE visit public.consultations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  IF _doctor_rating IS NULL OR _video_rating IS NULL
     OR _doctor_rating NOT BETWEEN 1 AND 5 OR _video_rating NOT BETWEEN 1 AND 5
     OR _comment IS NULL OR length(btrim(_comment)) > 500 THEN
    RAISE EXCEPTION 'Invalid feedback' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO visit FROM public.consultations WHERE id = _consultation_id;
  IF visit.id IS NULL OR visit.patient_id IS DISTINCT FROM auth.uid()
     OR visit.status <> 'completed' OR visit.doctor_id IS NULL THEN
    RAISE EXCEPTION 'Completed patient visit required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.visit_feedback(consultation_id, doctor_rating, video_rating, comment)
  VALUES (_consultation_id, _doctor_rating, _video_rating, btrim(_comment))
  ON CONFLICT (consultation_id) DO NOTHING;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_visit_feedback() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('consultation_id', f.consultation_id,
    'doctor_rating', f.doctor_rating, 'video_rating', f.video_rating, 'created_at', f.created_at)), '[]'::jsonb)
  FROM (SELECT f.consultation_id, f.doctor_rating, f.video_rating, f.created_at
        FROM public.visit_feedback f JOIN public.consultations c ON c.id = f.consultation_id
        WHERE c.patient_id = auth.uid() ORDER BY f.created_at DESC LIMIT 100) f;
$$;

CREATE OR REPLACE FUNCTION public.admin_visit_feedback() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE item record; result jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  FOR item IN
    SELECT f.consultation_id, f.doctor_rating, f.video_rating, f.comment, f.created_at,
      coalesce(p.full_name, '') AS doctor_name
    FROM public.visit_feedback f
    JOIN public.consultations c ON c.id = f.consultation_id
    LEFT JOIN public.profiles p ON p.id = c.doctor_id
    ORDER BY f.created_at DESC LIMIT 100
  LOOP
    INSERT INTO public.audit_log(actor_id, table_name, record_id, action)
    VALUES (auth.uid(), 'visit_feedback', item.consultation_id::text, 'SELECT');
    result := result || jsonb_build_array(jsonb_build_object(
      'consultation_id', item.consultation_id, 'doctor_rating', item.doctor_rating,
      'video_rating', item.video_rating, 'comment', item.comment,
      'created_at', item.created_at, 'doctor_name', item.doctor_name));
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_visit_feedback(uuid,integer,integer,text),
  public.my_visit_feedback(), public.admin_visit_feedback() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_visit_feedback(uuid,integer,integer,text),
  public.my_visit_feedback(), public.admin_visit_feedback() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
