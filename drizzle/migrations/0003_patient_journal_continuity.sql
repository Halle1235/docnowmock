CREATE TABLE public.patient_journal_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 patient_id uuid NOT NULL REFERENCES public.profiles(id),
 consultation_id uuid NOT NULL REFERENCES public.consultations(id),
 doctor_id uuid NOT NULL,
 doctor_name text NOT NULL,
 license_number text NOT NULL,
 diagnosis text NOT NULL DEFAULT '',
 treatment text NOT NULL DEFAULT '',
 notes text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT journal_field_bounds CHECK (length(notes) BETWEEN 1 AND 10000 AND length(btrim(notes)) > 0 AND length(diagnosis) <= 1000 AND length(treatment) <= 4000)
);
GRANT ALL ON public.patient_journal_entries TO service_role;
REVOKE ALL ON public.patient_journal_entries FROM anon, authenticated;
ALTER TABLE public.patient_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX patient_journal_timeline ON public.patient_journal_entries(patient_id, created_at DESC, id);
CREATE TRIGGER audit_patient_journal AFTER INSERT OR UPDATE OR DELETE ON public.patient_journal_entries FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE OR REPLACE FUNCTION public.list_patient_journal(_consultation_id uuid, _before timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; entries jsonb; p_name text;
BEGIN
 SELECT * INTO c FROM public.consultations WHERE id=_consultation_id;
 IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Consultation access denied' USING ERRCODE='42501'; END IF;
 IF NOT (public.has_role(auth.uid(),'admin') OR c.patient_id=auth.uid() OR
   (public.is_authorized_doctor(auth.uid()) AND c.doctor_id=auth.uid()))
 THEN RAISE EXCEPTION 'Assigned verified doctor required' USING ERRCODE='42501'; END IF;
 SELECT full_name INTO p_name FROM public.profiles WHERE id=c.patient_id;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC,e.id),'[]'::jsonb) INTO entries FROM
 (SELECT * FROM public.patient_journal_entries WHERE patient_id=c.patient_id AND (_before IS NULL OR created_at < _before) ORDER BY created_at DESC,id LIMIT 50) e;
 INSERT INTO public.audit_log(actor_id,table_name,record_id,action) VALUES(auth.uid(),'patient_journal_entries',c.patient_id::text,'SELECT');
 RETURN jsonb_build_object('patient_id',c.patient_id,'patient_name',p_name,'entries',entries);
END $$;
REVOKE ALL ON FUNCTION public.list_patient_journal(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_journal(uuid,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.add_patient_journal_entry(_consultation_id uuid, _diagnosis text, _treatment text, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; d record; entry_id uuid;
BEGIN
 SELECT * INTO c FROM public.consultations WHERE id=_consultation_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_authorized_doctor(auth.uid()) OR c.doctor_id IS DISTINCT FROM auth.uid() OR c.status NOT IN ('claimed','in_progress')
 THEN RAISE EXCEPTION 'Active assigned verified doctor required' USING ERRCODE='42501'; END IF;
 IF _notes IS NULL OR length(btrim(_notes))=0 OR length(_notes)>10000 OR _diagnosis IS NULL OR length(_diagnosis)>1000 OR _treatment IS NULL OR length(_treatment)>4000
 THEN RAISE EXCEPTION 'Invalid journal fields' USING ERRCODE='22023'; END IF;
 SELECT p.full_name,dp.license_number INTO d FROM public.profiles p JOIN public.doctor_profiles dp ON dp.user_id=p.id WHERE p.id=auth.uid();
 INSERT INTO public.patient_journal_entries(patient_id,consultation_id,doctor_id,doctor_name,license_number,diagnosis,treatment,notes)
 VALUES(c.patient_id,c.id,auth.uid(),d.full_name,d.license_number,btrim(_diagnosis),btrim(_treatment),btrim(_notes)) RETURNING id INTO entry_id;
 RETURN entry_id;
END $$;
REVOKE ALL ON FUNCTION public.add_patient_journal_entry(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_patient_journal_entry(uuid,text,text,text) TO authenticated;