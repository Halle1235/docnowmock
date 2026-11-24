ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_summary_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_authorized_doctor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'doctor') AND EXISTS
(SELECT 1 FROM public.doctor_profiles WHERE user_id = _user_id AND is_verified IS TRUE) $$;
REVOKE ALL ON FUNCTION public.is_authorized_doctor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_authorized_doctor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_patient_record_read(_table text, _id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$ DECLARE allowed boolean := false;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF _table = 'profiles' THEN
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _id AND
    (public.has_role(auth.uid(), 'admin') OR
     (public.is_authorized_doctor(auth.uid()) AND EXISTS
      (SELECT 1 FROM public.consultations c WHERE c.patient_id=p.id AND c.doctor_id=auth.uid())))) INTO allowed;
 ELSIF _table = 'consultations' THEN
  SELECT EXISTS (SELECT 1 FROM public.consultations c WHERE c.id=_id AND
    (public.has_role(auth.uid(), 'admin') OR
     (public.is_authorized_doctor(auth.uid()) AND c.doctor_id=auth.uid()))) INTO allowed;
 END IF;
 IF allowed THEN
  INSERT INTO public.audit_log(actor_id,table_name,record_id,action)
  VALUES(auth.uid(),_table,_id::text,'SELECT');
 END IF;
 RETURN allowed;
END $$;
REVOKE ALL ON FUNCTION public.audit_patient_record_read(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_patient_record_read(text,uuid) TO authenticated;

REVOKE ALL ON public.audit_log FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
REVOKE ALL ON public.profiles, public.consultations, public.doctor_profiles, public.user_roles, public.visit_summary_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles, public.consultations, public.doctor_profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_summary_drafts TO authenticated;
GRANT ALL ON public.profiles, public.consultations, public.doctor_profiles, public.user_roles, public.visit_summary_drafts TO service_role;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Audited staff profile reads" ON public.profiles FOR SELECT TO authenticated
USING (public.audit_patient_record_read('profiles',id));
CREATE POLICY "Admins can update patient profiles" ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Doctors can view all pending consultations" ON public.consultations;
CREATE POLICY "Audited assigned doctor and admin reads" ON public.consultations FOR SELECT TO authenticated
USING (public.audit_patient_record_read('consultations',id));
DROP POLICY IF EXISTS "Doctors can update claimed consultations" ON public.consultations;
CREATE POLICY "Verified assigned doctors and admins can update consultations" ON public.consultations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR (public.is_authorized_doctor(auth.uid()) AND doctor_id=auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin') OR (public.is_authorized_doctor(auth.uid()) AND doctor_id=auth.uid()));
DROP POLICY IF EXISTS "Assigned doctor can read draft" ON public.visit_summary_drafts;
CREATE POLICY "Verified doctor manages assigned drafts" ON public.visit_summary_drafts FOR ALL TO authenticated
USING (public.is_authorized_doctor(auth.uid()) AND EXISTS
(SELECT 1 FROM public.consultations c WHERE c.id=consultation_id AND c.doctor_id=auth.uid()))
WITH CHECK (public.is_authorized_doctor(auth.uid()) AND EXISTS
(SELECT 1 FROM public.consultations c WHERE c.id=consultation_id AND c.doctor_id=auth.uid()));
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users read own roles and admins read all roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can grant roles to others" ON public.user_roles;
CREATE POLICY "Admins grant roles to others" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (user_id<>auth.uid() AND public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can revoke roles from others" ON public.user_roles;
CREATE POLICY "Admins revoke roles from others" ON public.user_roles FOR DELETE TO authenticated
USING (user_id<>auth.uid() AND public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.list_doctor_consultations()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$ DECLARE result jsonb; c record;
BEGIN
 IF NOT public.is_authorized_doctor(auth.uid()) THEN RAISE EXCEPTION 'Verified doctor access required' USING ERRCODE='42501'; END IF;
 FOR c IN SELECT id,patient_id FROM public.consultations WHERE doctor_id=auth.uid() LOOP
  PERFORM public.audit_patient_record_read('consultations',c.id);
  PERFORM public.audit_patient_record_read('profiles',c.patient_id);
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

CREATE OR REPLACE FUNCTION public.claim_patient_consultation(_consultation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN
 IF NOT public.is_authorized_doctor(auth.uid()) OR NOT EXISTS
 (SELECT 1 FROM public.doctor_profiles WHERE user_id=auth.uid() AND is_available IS TRUE)
 THEN RAISE EXCEPTION 'Available verified doctor required' USING ERRCODE='42501'; END IF;
 UPDATE public.consultations SET doctor_id=auth.uid(),status='claimed',claimed_at=now()
 WHERE id=_consultation_id AND status='pending' AND doctor_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Consultation is no longer available' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_patient_consultation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_patient_consultation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_consultation_patient(_consultation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$ DECLARE c record; p record; years int;
BEGIN
 IF NOT public.audit_patient_record_read('consultations',_consultation_id) THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.consultations WHERE id=_consultation_id;
 IF NOT public.audit_patient_record_read('profiles',c.patient_id) THEN RETURN NULL; END IF;
 SELECT full_name,phone,date_of_birth,allergies INTO p FROM public.profiles WHERE id=c.patient_id;
 BEGIN years:=date_part('year',age(current_date,p.date_of_birth::date))::int;
 EXCEPTION WHEN others THEN years:=NULL; END;
 RETURN jsonb_build_object('full_name',p.full_name,'phone',p.phone,'age',years,'allergies',p.allergies);
END $$;
REVOKE ALL ON FUNCTION public.get_consultation_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_consultation_patient(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_consultation_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=public
AS $$ BEGIN
 IF auth.role()='service_role' THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.is_authorized_doctor(auth.uid()))
 THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Record identity cannot change'; END IF;
 IF public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
 IF OLD.doctor_id IS DISTINCT FROM auth.uid() AND NOT
 (OLD.status='pending' AND OLD.doctor_id IS NULL AND NEW.doctor_id=auth.uid() AND NEW.status='claimed'
 AND (to_jsonb(NEW)-ARRAY['doctor_id','status','claimed_at','updated_at'])=(to_jsonb(OLD)-ARRAY['doctor_id','status','claimed_at','updated_at']))
 THEN RAISE EXCEPTION 'Only the assigned doctor can change clinical records'; END IF;
 IF NEW.doctor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cannot reassign or clear the assigned doctor'; END IF;
 IF NEW.payment_status IS DISTINCT FROM OLD.payment_status OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
 OR NEW.reason_category IS DISTINCT FROM OLD.reason_category OR NEW.reason_description IS DISTINCT FROM OLD.reason_description
 OR NEW.telehealth_consent_at IS DISTINCT FROM OLD.telehealth_consent_at OR NEW.privacy_consent_at IS DISTINCT FROM OLD.privacy_consent_at
 OR NEW.emergency_disclaimer_ack_at IS DISTINCT FROM OLD.emergency_disclaimer_ack_at OR NEW.consent_version IS DISTINCT FROM OLD.consent_version
 THEN RAISE EXCEPTION 'These consultation fields cannot be changed'; END IF;
 IF NEW.prescription IS DISTINCT FROM OLD.prescription AND NEW.prescription IS NOT NULL AND NEW.prescription_no_controlled_ack IS NOT TRUE
 THEN RAISE EXCEPTION 'Confirm no controlled medication'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$ DECLARE o jsonb; n jsonb; rid text; fields text[];
BEGIN
 IF TG_OP<>'INSERT' THEN o:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN n:=to_jsonb(NEW); END IF;
 rid:=coalesce(n->>'id',o->>'id',n->>'consultation_id',o->>'consultation_id');
 IF TG_OP='UPDATE' THEN
  SELECT array_agg(k) INTO fields FROM jsonb_object_keys(n) k
  WHERE n->k IS DISTINCT FROM o->k AND k<>'updated_at';
  IF fields IS NULL THEN RETURN NEW; END IF;
 ELSE SELECT array_agg(k) INTO fields FROM jsonb_object_keys(coalesce(n,o)) k; END IF;
 INSERT INTO public.audit_log(actor_id,table_name,record_id,action,changed_fields)
 VALUES(auth.uid(),TG_TABLE_NAME,rid,TG_OP,fields);
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER audit_visit_summary_drafts AFTER INSERT OR UPDATE OR DELETE ON public.visit_summary_drafts
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE OR REPLACE FUNCTION public.list_admin_profiles()
RETURNS SETOF public.profiles LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public
AS $$ DECLARE p record; BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 FOR p IN SELECT id FROM public.profiles LOOP PERFORM public.audit_patient_record_read('profiles',p.id); END LOOP;
 RETURN QUERY SELECT * FROM public.profiles ORDER BY full_name;
END $$;
REVOKE ALL ON FUNCTION public.list_admin_profiles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_authorized_call_record(_consultation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public
AS $$ DECLARE c public.consultations; BEGIN
 SELECT * INTO c FROM public.consultations WHERE id=_consultation_id AND
 (patient_id=auth.uid() OR (doctor_id=auth.uid() AND public.is_authorized_doctor(auth.uid())));
 IF NOT FOUND THEN RAISE EXCEPTION 'Consultation access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_log(actor_id,table_name,record_id,action)
 VALUES(auth.uid(),'consultations',c.id::text,'SELECT');
 RETURN jsonb_build_object('id',c.id,'doctor_id',c.doctor_id,'patient_id',c.patient_id,
 'room_url',c.room_url,'status',c.status,'reason_category',c.reason_category,
 'reason_description',c.reason_description,'prescription',c.prescription);
END $$;
REVOKE ALL ON FUNCTION public.get_authorized_call_record(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_authorized_call_record(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_authorized_summary_draft(_consultation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public
AS $$ DECLARE result jsonb; BEGIN
 IF NOT public.is_authorized_doctor(auth.uid()) OR NOT EXISTS
 (SELECT 1 FROM public.consultations WHERE id=_consultation_id AND doctor_id=auth.uid())
 THEN RAISE EXCEPTION 'Assigned verified doctor required' USING ERRCODE='42501'; END IF;
 SELECT summary INTO result FROM public.visit_summary_drafts WHERE consultation_id=_consultation_id;
 IF result IS NOT NULL THEN
 INSERT INTO public.audit_log(actor_id,table_name,record_id,action)
 VALUES(auth.uid(),'visit_summary_drafts',_consultation_id::text,'SELECT'); END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_authorized_summary_draft(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_authorized_summary_draft(uuid) TO authenticated;