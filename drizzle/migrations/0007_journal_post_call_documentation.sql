CREATE OR REPLACE FUNCTION public.add_patient_journal_entry(_consultation_id uuid, _diagnosis text, _treatment text, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; d record; entry_id uuid;
BEGIN
 SELECT * INTO c FROM public.consultations WHERE id=_consultation_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(public.is_authorized_doctor(auth.uid()),false) OR c.doctor_id IS DISTINCT FROM auth.uid() OR c.status IS NULL OR c.status NOT IN ('claimed','in_progress','completed')
 THEN RAISE EXCEPTION 'Assigned verified doctor required for active or completed visit' USING ERRCODE='42501'; END IF;
 IF _notes IS NULL OR length(btrim(_notes))=0 OR length(_notes)>10000 OR _diagnosis IS NULL OR length(_diagnosis)>1000 OR _treatment IS NULL OR length(_treatment)>4000
 THEN RAISE EXCEPTION 'Invalid journal fields' USING ERRCODE='22023'; END IF;
 SELECT p.full_name,dp.license_number INTO d FROM public.profiles p JOIN public.doctor_profiles dp ON dp.user_id=p.id WHERE p.id=auth.uid();
 INSERT INTO public.patient_journal_entries(patient_id,consultation_id,doctor_id,doctor_name,license_number,diagnosis,treatment,notes)
 VALUES(c.patient_id,c.id,auth.uid(),d.full_name,d.license_number,btrim(_diagnosis),btrim(_treatment),btrim(_notes)) RETURNING id INTO entry_id;
 RETURN entry_id;
END $$;
REVOKE ALL ON FUNCTION public.add_patient_journal_entry(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_patient_journal_entry(uuid,text,text,text) TO authenticated;