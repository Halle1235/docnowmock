CREATE OR REPLACE FUNCTION public.consultations_accepting_requests()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.doctor_profiles
   WHERE is_available IS TRUE AND public.is_authorized_doctor(user_id));
$$;
REVOKE ALL ON FUNCTION public.consultations_accepting_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultations_accepting_requests() TO anon, authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_my_doctor_availability(_available boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _available IS NULL OR NOT coalesce(public.is_authorized_doctor(auth.uid()),false) THEN
   RAISE EXCEPTION 'Verified doctor access required' USING ERRCODE='42501';
 END IF;
 UPDATE public.doctor_profiles SET is_available=_available
 WHERE user_id=auth.uid() AND is_verified IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified doctor access required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_my_doctor_availability(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_doctor_availability(boolean) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_consultation_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=public
AS $$ BEGIN
 IF auth.role()='service_role' THEN RETURN NEW; END IF;
 IF auth.uid() IS NOT NULL AND OLD.patient_id=auth.uid()
 AND OLD.status='pending' AND OLD.doctor_id IS NULL AND OLD.room_url IS NULL
 AND OLD.payment_status='pending' AND NEW.status='cancelled'
 AND (to_jsonb(NEW)-ARRAY['status','updated_at'])=(to_jsonb(OLD)-ARRAY['status','updated_at'])
 THEN RETURN NEW; END IF;
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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cancel_my_waiting_booking(_consultation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to cancel' USING ERRCODE='42501'; END IF;
 UPDATE public.consultations SET status='cancelled'
 WHERE id=_consultation_id AND patient_id=auth.uid() AND status='pending'
   AND doctor_id IS NULL AND room_url IS NULL AND payment_status='pending';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.cancel_my_waiting_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_waiting_booking(uuid) TO authenticated;
--> statement-breakpoint
CREATE TABLE public.visit_ready_email_queue (
 consultation_id uuid PRIMARY KEY REFERENCES public.consultations(id) ON DELETE CASCADE,
 queued_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 sent_at timestamptz
);
ALTER TABLE public.visit_ready_email_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visit_ready_email_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.visit_ready_email_queue TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.enqueue_visit_ready_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.visit_ready_email_queue(consultation_id) VALUES(NEW.id)
 ON CONFLICT (consultation_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_visit_ready_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enqueue_visit_ready_email
 AFTER UPDATE OF room_url, status ON public.consultations FOR EACH ROW
 WHEN (OLD.room_url IS NULL AND NEW.room_url IS NOT NULL AND NEW.doctor_id IS NOT NULL
   AND NEW.status IN ('claimed','in_progress'))
 EXECUTE FUNCTION public.enqueue_visit_ready_email();
--> statement-breakpoint
CREATE FUNCTION public.claim_visit_ready_emails()
RETURNS TABLE(consultation_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH batch AS (
   SELECT q.consultation_id, u.email::text
   FROM public.visit_ready_email_queue q
   JOIN public.consultations c ON c.id=q.consultation_id
   JOIN auth.users u ON u.id=c.patient_id
   WHERE q.sent_at IS NULL AND q.attempts<5 AND q.next_attempt_at<=now()
     AND q.queued_at>now()-interval '30 minutes'
     AND c.status IN ('claimed','in_progress') AND c.room_url IS NOT NULL
     AND c.room_closed_at IS NULL AND public.is_authorized_doctor(c.doctor_id)
     AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
   ORDER BY q.next_attempt_at, q.consultation_id
   LIMIT 10 FOR UPDATE OF q SKIP LOCKED
 )
 UPDATE public.visit_ready_email_queue q
 SET attempts=q.attempts+1, next_attempt_at=now()+interval '3 minutes'
 FROM batch WHERE q.consultation_id=batch.consultation_id
 RETURNING batch.consultation_id, batch.email;
$$;
REVOKE ALL ON FUNCTION public.claim_visit_ready_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_visit_ready_emails() TO service_role;
