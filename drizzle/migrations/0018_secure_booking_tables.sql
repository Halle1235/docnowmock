ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_summary_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Patient identity, consent and the pending amount are derived by the booking RPC.
REVOKE INSERT ON public.consultations FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Patients can create consultations" ON public.consultations;

-- Independent of the booking-continuity version of guard_consultation_update.
CREATE OR REPLACE FUNCTION public.guard_payment_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (NEW.payment_status IS DISTINCT FROM OLD.payment_status
          OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount) THEN
    RAISE EXCEPTION 'Only the payment service can change payment fields' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_payment_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_payment_update_trg ON public.consultations;
CREATE TRIGGER guard_payment_update_trg BEFORE UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.guard_payment_update();
