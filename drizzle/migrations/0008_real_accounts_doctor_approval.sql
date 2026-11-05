REVOKE ALL ON FUNCTION public.create_test_booking(text,text), public.list_test_bookings(), public.get_test_booking(uuid), public.claim_test_booking(uuid), public.complete_test_booking(uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.test_bookings IS 'DEPRECATED: no-account test bookings retired; real accounts only.';
CREATE OR REPLACE FUNCTION public.apply_for_doctor(_license_number text, _specialization text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before applying' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(_license_number,''))) NOT BETWEEN 2 AND 64 OR length(btrim(coalesce(_specialization,''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Invalid license or specialization' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.doctor_profiles WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'A doctor application already exists' USING ERRCODE='23505'; END IF;
 INSERT INTO public.doctor_profiles(user_id,license_number,specialization,is_verified,is_available) VALUES(auth.uid(),btrim(_license_number),btrim(_specialization),false,false) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_for_doctor(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_for_doctor(text,text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.guard_doctor_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'')='service_role' OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN NEW.is_verified:=false; NEW.is_available:=false;
 ELSE
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Doctor identity cannot be changed' USING ERRCODE='42501'; END IF;
 IF NEW.license_number IS DISTINCT FROM OLD.license_number OR NEW.specialization IS DISTINCT FROM OLD.specialization THEN RAISE EXCEPTION 'Contact an administrator to change verified license details' USING ERRCODE='42501'; END IF;
 NEW.is_verified:=OLD.is_verified;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_unverified_payments()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' AND NEW.payment_status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Payment must be confirmed by a payment provider' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_unverified_payment_insert BEFORE INSERT ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.guard_unverified_payments();