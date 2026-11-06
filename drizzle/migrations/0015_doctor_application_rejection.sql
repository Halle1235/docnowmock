-- Migration 0015: Doctor application rejection, dismissal, and availability management for administrators

-- 1. Add rejection tracking columns to doctor_profiles
ALTER TABLE public.doctor_profiles
ADD COLUMN IF NOT EXISTS rejection_reason text,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- 2. RPC to reject a doctor application with a specific reason
CREATE OR REPLACE FUNCTION public.reject_doctor_application(_doctor_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user_id uuid;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN
   RAISE EXCEPTION 'Only administrators can reject doctor applications' USING ERRCODE='42501';
 END IF;

 SELECT user_id INTO target_user_id FROM public.doctor_profiles WHERE id = _doctor_id;
 IF target_user_id IS NULL THEN
   RAISE EXCEPTION 'Doctor profile not found' USING ERRCODE='P0002';
 END IF;

 UPDATE public.doctor_profiles
 SET is_verified = false,
     is_available = false,
     rejection_reason = btrim(coalesce(_reason, 'Application declined by administrator')),
     rejected_at = now()
 WHERE id = _doctor_id;

 -- Remove doctor role if user had it
 DELETE FROM public.user_roles
 WHERE user_id = target_user_id AND role = 'doctor';
END $$;

REVOKE ALL ON FUNCTION public.reject_doctor_application(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_doctor_application(uuid, text) TO authenticated, service_role;

-- 3. RPC to permanently delete/dismiss an unverified or accidental doctor application
CREATE OR REPLACE FUNCTION public.dismiss_doctor_application(_doctor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN
   RAISE EXCEPTION 'Only administrators can dismiss doctor applications' USING ERRCODE='42501';
 END IF;

 DELETE FROM public.doctor_profiles WHERE id = _doctor_id AND is_verified IS FALSE;
END $$;

REVOKE ALL ON FUNCTION public.dismiss_doctor_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_doctor_application(uuid) TO authenticated, service_role;

-- 4. RPC for administrators to override doctor online/available status
CREATE OR REPLACE FUNCTION public.set_doctor_availability(_doctor_id uuid, _is_available boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN
   RAISE EXCEPTION 'Only administrators can toggle doctor availability' USING ERRCODE='42501';
 END IF;

 UPDATE public.doctor_profiles
 SET is_available = _is_available
 WHERE id = _doctor_id;
END $$;

REVOKE ALL ON FUNCTION public.set_doctor_availability(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_doctor_availability(uuid, boolean) TO authenticated, service_role;

