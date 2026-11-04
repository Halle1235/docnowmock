CREATE OR REPLACE FUNCTION public.list_patient_journal(_consultation_id uuid, _before timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; entries jsonb; p_name text;
BEGIN
 SELECT * INTO c FROM public.consultations WHERE id=_consultation_id;
 IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Consultation access denied' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(public.has_role(auth.uid(),'admin') OR c.patient_id=auth.uid() OR
   (public.is_authorized_doctor(auth.uid()) AND c.doctor_id IS NOT DISTINCT FROM auth.uid()),false)
 THEN RAISE EXCEPTION 'Assigned verified doctor required' USING ERRCODE='42501'; END IF;
 SELECT full_name INTO p_name FROM public.profiles WHERE id=c.patient_id;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC,e.id),'[]'::jsonb) INTO entries FROM
 (SELECT * FROM public.patient_journal_entries WHERE patient_id=c.patient_id AND (_before IS NULL OR created_at < _before) ORDER BY created_at DESC,id LIMIT 50) e;
 INSERT INTO public.audit_log(actor_id,table_name,record_id,action) VALUES(auth.uid(),'patient_journal_entries',c.patient_id::text,'SELECT');
 RETURN jsonb_build_object('patient_id',c.patient_id,'patient_name',p_name,'entries',entries);
END $$;
REVOKE ALL ON FUNCTION public.list_patient_journal(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_journal(uuid,timestamptz) TO authenticated;