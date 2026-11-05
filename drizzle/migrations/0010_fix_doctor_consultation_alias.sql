CREATE OR REPLACE FUNCTION public.list_doctor_consultations()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$ DECLARE result jsonb; assigned_visit record;
BEGIN
 IF NOT public.is_authorized_doctor(auth.uid()) THEN RAISE EXCEPTION 'Verified doctor access required' USING ERRCODE='42501'; END IF;
 FOR assigned_visit IN SELECT visit.id,visit.patient_id FROM public.consultations visit WHERE visit.doctor_id=auth.uid() LOOP
  PERFORM public.audit_patient_record_read('consultations',assigned_visit.id);
  PERFORM public.audit_patient_record_read('profiles',assigned_visit.patient_id);
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'patient_id',CASE WHEN c.doctor_id=auth.uid() THEN c.patient_id ELSE NULL END,
  'status',c.status,'payment_status',c.payment_status,'payment_amount',c.payment_amount,
  'created_at',c.created_at,'reason_category',c.reason_category,
  'reason_description',CASE WHEN c.doctor_id=auth.uid() THEN c.reason_description ELSE NULL END,
  'profiles',jsonb_build_object('full_name',CASE WHEN c.doctor_id=auth.uid() THEN p.full_name ELSE '' END,
                              'phone',CASE WHEN c.doctor_id=auth.uid() THEN p.phone ELSE '' END)
 ) ORDER BY c.created_at DESC),'[]'::jsonb) INTO result
 FROM public.consultations c LEFT JOIN public.profiles p ON p.id=c.patient_id AND c.doctor_id=auth.uid()
 WHERE c.doctor_id=auth.uid() OR (c.status='pending' AND c.doctor_id IS NULL);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_doctor_consultations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_doctor_consultations() TO authenticated;