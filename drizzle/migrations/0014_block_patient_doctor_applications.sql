-- Migration 0014: Block patient accounts from applying as doctors and allow withdrawing pending applications

-- 1. Update apply_for_doctor to reject registered patients with consultations
CREATE OR REPLACE FUNCTION public.apply_for_doctor(_license_number text, _specialization text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before applying' USING ERRCODE='42501'; END IF;

 -- Block registered patients with consultations from registering as doctors
 IF EXISTS(SELECT 1 FROM public.consultations WHERE patient_id = auth.uid()) THEN
   RAISE EXCEPTION 'Patient accounts cannot register as doctors. Please use a separate healthcare professional account.' USING ERRCODE='42501';
 END IF;

 IF length(btrim(coalesce(_license_number,''))) NOT BETWEEN 2 AND 64 OR length(btrim(coalesce(_specialization,''))) NOT BETWEEN 2 AND 120 THEN
   RAISE EXCEPTION 'Invalid license or specialization' USING ERRCODE='22023';
 END IF;

 IF EXISTS(SELECT 1 FROM public.doctor_profiles WHERE user_id=auth.uid()) THEN
   RAISE EXCEPTION 'A doctor application already exists' USING ERRCODE='23505';
 END IF;

 INSERT INTO public.doctor_profiles(user_id,license_number,specialization,is_verified,is_available)
 VALUES(auth.uid(),btrim(_license_number),btrim(_specialization),false,false)
 RETURNING id INTO result;

 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.apply_for_doctor(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_for_doctor(text,text) TO authenticated, service_role;

-- 2. Create withdraw_doctor_application RPC to let users cancel accidental or unverified applications
CREATE OR REPLACE FUNCTION public.withdraw_doctor_application()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;

 DELETE FROM public.doctor_profiles
 WHERE user_id = auth.uid() AND is_verified IS FALSE;
END $$;

REVOKE ALL ON FUNCTION public.withdraw_doctor_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_doctor_application() TO authenticated, service_role;

-- 3. Policy and grants to allow deleting pending applications directly if needed
GRANT DELETE ON public.doctor_profiles TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'doctor_profiles' AND policyname = 'Users can withdraw their pending doctor application'
  ) THEN
    CREATE POLICY "Users can withdraw their pending doctor application"
    ON public.doctor_profiles FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND is_verified IS FALSE);
  END IF;
END $$;

