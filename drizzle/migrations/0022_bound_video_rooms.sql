CREATE FUNCTION public.video_room_for_actor(_consultation_id uuid, _actor uuid, _reserve boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE visit public.consultations; binding docnow_private.video_rooms; current_doctor uuid; doctor boolean; lease uuid;
BEGIN
  SELECT doctor_id INTO current_doctor FROM public.consultations WHERE id = _consultation_id;
  PERFORM 1 FROM public.doctor_profiles WHERE user_id = current_doctor FOR UPDATE;
  SELECT * INTO visit FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  doctor := _actor IS NOT NULL AND visit.doctor_id IS NOT DISTINCT FROM _actor AND public.is_authorized_doctor(_actor);
  IF visit.id IS NULL OR _actor IS NULL OR (visit.patient_id IS DISTINCT FROM _actor AND NOT doctor) THEN
    RETURN jsonb_build_object('state','forbidden');
  END IF;
  IF visit.status NOT IN ('claimed','in_progress') OR visit.room_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('state','closed');
  END IF;
  IF visit.doctor_id IS DISTINCT FROM current_doctor OR NOT public.is_authorized_doctor(visit.doctor_id) THEN
    RETURN jsonb_build_object('state','waiting');
  END IF;
  SELECT * INTO binding FROM docnow_private.video_rooms WHERE consultation_id = visit.id;
  IF binding.expires_at <= now() OR binding.cleaned_at IS NOT NULL THEN
    RETURN jsonb_build_object('state','closed');
  END IF;
  IF binding.provider_id IS NULL THEN
    IF NOT _reserve OR NOT doctor OR binding.lease_until > now() THEN
      RETURN jsonb_build_object('state','waiting');
    END IF;
    IF visit.room_url IS NOT NULL THEN
      -- Legacy URLs are retained as history. Their source was not a trusted room binding.
      RETURN jsonb_build_object('state','closed');
    END IF;
    lease := gen_random_uuid();
    INSERT INTO docnow_private.video_rooms(consultation_id, lease_id, lease_until)
    VALUES (visit.id, lease, now() + interval '45 seconds')
    ON CONFLICT (consultation_id) DO UPDATE
    SET lease_id = excluded.lease_id, lease_until = excluded.lease_until
    RETURNING * INTO binding;
  END IF;
  RETURN jsonb_build_object('state', CASE WHEN lease IS NULL THEN 'ready' ELSE 'reserved' END,
    'name', binding.name, 'provider_id', binding.provider_id, 'lease', lease,
    'expires_at', extract(epoch FROM binding.expires_at)::bigint, 'is_doctor', doctor);
END;
$$;

CREATE FUNCTION public.attach_bound_video_room(_consultation_id uuid, _actor uuid, _lease uuid, _provider_id text, _room_url text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE visit public.consultations;
BEGIN
  IF _actor IS NULL OR _lease IS NULL OR coalesce(length(_provider_id),0) NOT BETWEEN 1 AND 128 THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.doctor_profiles WHERE user_id = _actor FOR UPDATE;
  SELECT * INTO visit FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  IF visit.id IS NULL OR visit.doctor_id IS DISTINCT FROM _actor OR NOT public.is_authorized_doctor(_actor)
      OR visit.status NOT IN ('claimed','in_progress') OR visit.room_closed_at IS NOT NULL THEN
    RETURN false;
  END IF;
  UPDATE docnow_private.video_rooms SET provider_id = _provider_id, lease_id = NULL, lease_until = NULL
    WHERE consultation_id = _consultation_id AND lease_id = _lease AND lease_until > now()
      AND provider_id IS NULL AND expires_at > now() AND cleaned_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor::text, true);
  UPDATE public.consultations SET status = 'in_progress', room_url = _room_url WHERE id = _consultation_id AND status = 'claimed';
  RETURN true;
END;
$$;

CREATE FUNCTION public.close_bound_video_room(_consultation_id uuid, _actor uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE visit public.consultations;
BEGIN
  IF _actor IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM public.doctor_profiles WHERE user_id = _actor FOR UPDATE;
  SELECT * INTO visit FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  IF visit.id IS NULL OR visit.doctor_id IS DISTINCT FROM _actor OR NOT public.is_authorized_doctor(_actor)
    OR visit.status NOT IN ('claimed','in_progress','completed') THEN
    RETURN false;
  END IF;
  IF visit.status IN ('claimed','in_progress') THEN
    PERFORM set_config('request.jwt.claim.sub', _actor::text, true);
    UPDATE public.consultations SET status = 'completed', completed_at = now() WHERE id = _consultation_id;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.video_room_cleanup_targets(_consultation_id uuid DEFAULT NULL, _doctor_id uuid DEFAULT NULL)
RETURNS TABLE (consultation_id uuid, name text, provider_id text, lease_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT r.consultation_id, r.name, r.provider_id, coalesce(r.lease_until > now(),false)
  FROM docnow_private.video_rooms r JOIN public.consultations c ON c.id = r.consultation_id
  WHERE ((_consultation_id IS NOT NULL AND c.id = _consultation_id)
     OR (_doctor_id IS NOT NULL AND c.doctor_id = _doctor_id))
    AND c.status IN ('completed','cancelled') AND r.cleaned_at IS NULL
  ORDER BY r.lease_until NULLS FIRST, r.consultation_id
  LIMIT 10;
$$;

CREATE FUNCTION public.mark_video_room_cleaned(_consultation_id uuid, _name text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  UPDATE docnow_private.video_rooms r SET cleaned_at = now()
  FROM public.consultations c
  WHERE c.id = r.consultation_id AND c.status IN ('completed','cancelled')
    AND r.consultation_id = _consultation_id AND r.name = _name AND r.cleaned_at IS NULL
    AND (r.lease_until IS NULL OR r.lease_until <= now());
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.video_room_cleanup_pending(_doctor_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM docnow_private.video_rooms r JOIN public.consultations c ON c.id = r.consultation_id
    WHERE c.doctor_id = _doctor_id AND c.status IN ('completed','cancelled') AND r.cleaned_at IS NULL);
$$;

REVOKE ALL ON FUNCTION public.video_room_for_actor(uuid,uuid,boolean), public.attach_bound_video_room(uuid,uuid,uuid,text,text),
  public.close_bound_video_room(uuid,uuid), public.video_room_cleanup_targets(uuid,uuid), public.mark_video_room_cleaned(uuid,text),
  public.video_room_cleanup_pending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.video_room_for_actor(uuid,uuid,boolean), public.attach_bound_video_room(uuid,uuid,uuid,text,text),
  public.close_bound_video_room(uuid,uuid), public.video_room_cleanup_targets(uuid,uuid), public.mark_video_room_cleaned(uuid,text),
  public.video_room_cleanup_pending(uuid) TO service_role;

-- A hosted database can be one migration behind the app. Ensure these small RPCs can be rolled out without activating the email worker.
CREATE OR REPLACE FUNCTION public.consultations_accepting_requests() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.doctor_profiles d JOIN public.user_roles r
    ON r.user_id = d.user_id AND r.role = 'doctor' WHERE d.is_available IS TRUE AND d.is_verified IS TRUE);
$$;
REVOKE ALL ON FUNCTION public.consultations_accepting_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultations_accepting_requests() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_my_doctor_availability(_available boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF _available IS NULL OR NOT public.is_authorized_doctor(auth.uid()) THEN
    RAISE EXCEPTION 'Verified doctor access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.doctor_profiles SET is_available = _available WHERE user_id = auth.uid() AND is_verified IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified doctor access required' USING ERRCODE = '42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_doctor_availability(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_doctor_availability(boolean) TO authenticated;

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


CREATE OR REPLACE FUNCTION public.cancel_my_waiting_booking(_consultation_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to cancel' USING ERRCODE = '42501'; END IF;
  UPDATE public.consultations SET status = 'cancelled'
  WHERE id = _consultation_id AND patient_id = auth.uid() AND status = 'pending'
    AND doctor_id IS NULL AND room_url IS NULL AND payment_status = 'pending';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_my_waiting_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_waiting_booking(uuid) TO authenticated;
