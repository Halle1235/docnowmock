CREATE OR REPLACE FUNCTION public.get_assigned_visit_summary(_consultation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('notes', c.notes, 'summary', c.visit_summary)
    INTO result FROM public.consultations c
    WHERE c.id = _consultation_id AND c.doctor_id = auth.uid()
      AND public.is_authorized_doctor(auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assigned verified doctor required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.audit_log(actor_id, table_name, record_id, action)
    VALUES (auth.uid(), 'consultations', _consultation_id::text, 'SELECT');
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_assigned_visit_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assigned_visit_summary(uuid) TO authenticated;
