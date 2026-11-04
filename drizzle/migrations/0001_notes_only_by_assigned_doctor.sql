CREATE OR REPLACE FUNCTION public.guard_consultation_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- server-side (service role)
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
     OR NEW.reason_category IS DISTINCT FROM OLD.reason_category
     OR NEW.reason_description IS DISTINCT FROM OLD.reason_description
     OR NEW.telehealth_consent_at IS DISTINCT FROM OLD.telehealth_consent_at
     OR NEW.privacy_consent_at IS DISTINCT FROM OLD.privacy_consent_at
     OR NEW.emergency_disclaimer_ack_at IS DISTINCT FROM OLD.emergency_disclaimer_ack_at
     OR NEW.consent_version IS DISTINCT FROM OLD.consent_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'These consultation fields cannot be changed';
  END IF;
  IF NEW.doctor_id IS NOT NULL AND NEW.doctor_id <> auth.uid() THEN
    RAISE EXCEPTION 'A doctor can only claim a consultation for themselves';
  END IF;
  IF (NEW.notes IS DISTINCT FROM OLD.notes OR NEW.prescription IS DISTINCT FROM OLD.prescription)
     AND NEW.doctor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned doctor can write notes or prescriptions';
  END IF;
  IF NEW.prescription IS NOT NULL AND NEW.prescription IS DISTINCT FROM OLD.prescription
     AND NEW.prescription_no_controlled_ack IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirm the prescription contains no narcotic, controlled or semi-controlled medication';
  END IF;
  RETURN NEW;
END $function$;