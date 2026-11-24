CREATE SCHEMA IF NOT EXISTS docnow_private;
REVOKE ALL ON SCHEMA docnow_private FROM PUBLIC, anon, authenticated;

CREATE TABLE docnow_private.video_rooms (
  consultation_id uuid PRIMARY KEY REFERENCES public.consultations(id),
  name text UNIQUE NOT NULL DEFAULT ('docnow-' || replace(gen_random_uuid()::text, '-', '')),
  provider_id text UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  lease_id uuid,
  lease_until timestamptz,
  cleaned_at timestamptz
);
ALTER TABLE docnow_private.video_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON docnow_private.video_rooms FROM PUBLIC, anon, authenticated;

CREATE FUNCTION docnow_private.require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.my_account_access() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  PERFORM public.ensure_default_patient_account();
  IF public.has_role(actor, 'admin') THEN RETURN 'admin'; END IF;
  IF public.is_authorized_doctor(actor) THEN RETURN 'doctor'; END IF;
  IF public.has_role(actor, 'doctor') OR EXISTS (SELECT 1 FROM public.doctor_profiles WHERE user_id = actor)
    THEN RETURN 'pending'; END IF;
  RETURN 'patient';
END;
$$;

CREATE FUNCTION public.my_display_name() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT full_name FROM public.profiles WHERE id = auth.uid();
$$;

CREATE FUNCTION public.my_booking_profile() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('full_name', full_name, 'phone', phone, 'passport_number', passport_number,
    'date_of_birth', date_of_birth, 'identification_type', identification_type, 'emirates_id', emirates_id,
    'contact_email', contact_email)
  FROM public.profiles WHERE id = auth.uid() AND public.has_role(auth.uid(), 'patient');
$$;

CREATE FUNCTION public.my_doctor_details() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('full_name', p.full_name, 'specialization', d.specialization,
    'license_number', d.license_number, 'is_available', d.is_available)
  FROM public.doctor_profiles d LEFT JOIN public.profiles p ON p.id = d.user_id
  WHERE d.user_id = auth.uid() AND public.is_authorized_doctor(auth.uid());
$$;

CREATE FUNCTION docnow_private.room_ready(visit_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM docnow_private.video_rooms
    WHERE consultation_id = visit_id AND provider_id IS NOT NULL AND cleaned_at IS NULL AND expires_at > now());
$$;

CREATE FUNCTION public.my_visits() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'created_at', c.created_at,
      'reason_category', c.reason_category, 'status', c.status,
      'room_ready', c.status IN ('claimed', 'in_progress') AND docnow_private.room_ready(c.id),
      'doctor_assigned', c.doctor_id IS NOT NULL, 'payment_status', c.payment_status,
      'visit_summary', CASE WHEN c.visit_summary_approved_at IS NOT NULL THEN c.visit_summary END,
      'visit_summary_approved_at', c.visit_summary_approved_at) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM (SELECT * FROM public.consultations WHERE patient_id = auth.uid() ORDER BY created_at DESC LIMIT 1000) c;
$$;

CREATE FUNCTION public.my_waiting_visit(_consultation_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('id', c.id, 'status', c.status, 'payment_status', c.payment_status,
    'room_ready', c.status IN ('claimed','in_progress') AND docnow_private.room_ready(c.id),
    'reason_description', c.reason_description)
  FROM public.consultations c WHERE c.id = _consultation_id AND c.patient_id = auth.uid();
$$;

CREATE FUNCTION public.my_call_state(_consultation_id uuid, _include_details boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE visit public.consultations; actor uuid := auth.uid(); doctor boolean;
BEGIN
  SELECT * INTO visit FROM public.consultations WHERE id = _consultation_id;
  doctor := actor IS NOT NULL AND visit.doctor_id IS NOT DISTINCT FROM actor AND public.is_authorized_doctor(actor);
  IF actor IS NULL OR visit.id IS NULL OR (visit.patient_id IS DISTINCT FROM actor AND NOT doctor) THEN
    RAISE EXCEPTION 'Consultation access denied' USING ERRCODE = '42501';
  END IF;
  IF doctor THEN
    PERFORM public.audit_patient_record_read('consultations', visit.id);
  END IF;
  RETURN jsonb_build_object('status', visit.status, 'is_doctor', doctor,
    'room_ready', visit.status IN ('claimed','in_progress') AND docnow_private.room_ready(visit.id),
    'reason_description', CASE WHEN _include_details THEN visit.reason_description END);
END;
$$;

CREATE FUNCTION public.save_assigned_visit_summary(_consultation_id uuid, _notes text, _summary jsonb, _journal_treatment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor uuid := auth.uid(); entry jsonb; field text; item jsonb; visit public.consultations;
BEGIN
  PERFORM 1 FROM public.doctor_profiles WHERE user_id = actor FOR UPDATE;
  IF actor IS NULL OR NOT public.is_authorized_doctor(actor) THEN
    RAISE EXCEPTION 'Verified doctor required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(btrim(_notes)), 0) NOT BETWEEN 1 AND 10000
     OR jsonb_typeof(_summary) IS DISTINCT FROM 'object' OR octet_length(_summary::text) > 32000
     OR coalesce(length(_journal_treatment), 0) > 4000 THEN
    RAISE EXCEPTION 'Invalid summary fields' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(_summary) key
      WHERE key NOT IN ('overview','diagnosis','treatment_plan','medications','self_care','warning_signs','follow_up','follow_up_recommended'))
     OR jsonb_typeof(_summary->'diagnosis') IS DISTINCT FROM 'string'
     OR jsonb_typeof(_summary->'follow_up') IS DISTINCT FROM 'string'
     OR (_summary ? 'follow_up_recommended' AND jsonb_typeof(_summary->'follow_up_recommended') IS DISTINCT FROM 'boolean')
     OR (_summary->'follow_up_recommended' = 'true'::jsonb AND btrim(_summary->>'follow_up') = '')
     OR length(_summary->>'diagnosis') > 1000 OR length(_summary->>'follow_up') > 1000 THEN
    RAISE EXCEPTION 'Invalid summary text' USING ERRCODE = '22023';
  END IF;
  FOREACH field IN ARRAY ARRAY['treatment_plan','self_care','warning_signs','medications'] LOOP
    IF jsonb_typeof(_summary->field) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid summary list' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_summary->field) LOOP
      IF field = 'medications' THEN
        IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Invalid summary medication' USING ERRCODE = '22023';
        END IF;
        IF item - ARRAY['name','instructions'] <> '{}'::jsonb
           OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
           OR jsonb_typeof(item->'instructions') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Invalid summary medication' USING ERRCODE = '22023';
        END IF;
      ELSIF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Invalid summary item' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;
  entry := jsonb_set(_summary, '{overview}', to_jsonb(btrim(_notes)));
  SELECT * INTO visit FROM public.consultations
    WHERE id = _consultation_id AND doctor_id = actor AND status IN ('claimed','in_progress','completed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assigned consultation required' USING ERRCODE = '42501'; END IF;
  IF visit.notes IS NOT DISTINCT FROM btrim(_notes) AND visit.visit_summary IS NOT DISTINCT FROM entry
     AND visit.visit_summary_approved_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.consultations SET notes = btrim(_notes), visit_summary = entry,
    visit_summary_approved_at = now(), visit_summary_approved_by = actor WHERE id = visit.id;
  PERFORM public.add_patient_journal_entry(_consultation_id, entry->>'diagnosis', coalesce(_journal_treatment,''), btrim(_notes));
END;
$$;

CREATE FUNCTION public.admin_directory() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE profiles jsonb; people jsonb;
BEGIN
  PERFORM docnow_private.require_admin();
  INSERT INTO public.audit_log(actor_id, table_name, record_id, action)
  SELECT auth.uid(), 'profiles', u.id::text, 'SELECT' FROM auth.users u
  UNION ALL SELECT auth.uid(), 'user_roles', r.id::text, 'SELECT' FROM public.user_roles r
  UNION ALL SELECT auth.uid(), 'doctor_profiles', d.id::text, 'SELECT' FROM public.doctor_profiles d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id,
    'full_name', coalesce(p.full_name, ''), 'email', coalesce(p.email, u.email, ''),
    'phone', p.phone) ORDER BY p.full_name, u.id), '[]'::jsonb) INTO profiles
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id;
  SELECT jsonb_build_object('profiles', profiles,
    'roles', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role)) FROM public.user_roles), '[]'::jsonb),
    'doctors', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'user_id', d.user_id,
      'license_number', d.license_number, 'specialization', d.specialization, 'is_verified', d.is_verified,
      'cleanup_pending', EXISTS (SELECT 1 FROM docnow_private.video_rooms r JOIN public.consultations c ON c.id = r.consultation_id
        WHERE c.doctor_id = d.user_id AND c.status IN ('completed','cancelled') AND r.cleaned_at IS NULL)))
      FROM public.doctor_profiles d), '[]'::jsonb),
    'cleanup_without_profile', coalesce((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('doctor_id', c.doctor_id, 'name', p.full_name))
      FROM docnow_private.video_rooms r JOIN public.consultations c ON c.id = r.consultation_id
      LEFT JOIN public.profiles p ON p.id = c.doctor_id
      WHERE c.doctor_id IS NOT NULL AND c.status IN ('completed','cancelled') AND r.cleaned_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.doctor_profiles d WHERE d.user_id = c.doctor_id)), '[]'::jsonb)) INTO people;
  RETURN people;
END;
$$;

CREATE FUNCTION public.admin_edit_profile(_user_id uuid, _full_name text, _phone text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM docnow_private.require_admin();
  IF coalesce(length(btrim(_full_name)), 0) NOT BETWEEN 1 AND 120 OR coalesce(length(_phone), 0) > 32 THEN
    RAISE EXCEPTION 'Invalid profile details' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.profiles(id, full_name, email, phone)
    SELECT u.id, btrim(_full_name), coalesce(u.email, ''), nullif(btrim(_phone),'') FROM auth.users u WHERE u.id = _user_id
  ON CONFLICT (id) DO UPDATE SET full_name = excluded.full_name, phone = excluded.phone;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = '22023'; END IF;
END;
$$;

CREATE FUNCTION public.admin_set_basic_role(_user_id uuid, _role public.app_role, _enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM docnow_private.require_admin();
  IF _user_id IS NULL OR _user_id = auth.uid() OR _enabled IS NULL OR _role IS NULL OR _role = 'doctor'
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Invalid role change' USING ERRCODE = '42501';
  END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

CREATE FUNCTION docnow_private.cancel_revoked_doctor_visits(_doctor_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  UPDATE public.consultations SET status = 'cancelled'
  WHERE doctor_id = _doctor_id AND status IN ('claimed','in_progress');
$$;

CREATE FUNCTION docnow_private.close_visits_on_doctor_revoke() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    IF OLD.role = 'doctor' THEN PERFORM docnow_private.cancel_revoked_doctor_visits(OLD.user_id); END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_verified IS TRUE AND NEW.is_verified IS NOT TRUE THEN
    PERFORM docnow_private.cancel_revoked_doctor_visits(OLD.user_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.admin_set_doctor_access(_user_id uuid, _enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM docnow_private.require_admin();
  IF _enabled IS NULL THEN RAISE EXCEPTION 'Invalid verification' USING ERRCODE = '22023'; END IF;
  UPDATE public.doctor_profiles SET is_verified = _enabled, is_available = _enabled WHERE user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doctor application required' USING ERRCODE = '42501'; END IF;
  -- Hosted installations also sync this role in a trigger. Explicit writes cover older baselines and are idempotent.
  IF _enabled THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id,'doctor') ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'doctor';
    PERFORM docnow_private.cancel_revoked_doctor_visits(_user_id);
  END IF;
END;
$$;

CREATE FUNCTION public.admin_close_revoked_doctor_visits(_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM docnow_private.require_admin();
  PERFORM 1 FROM public.doctor_profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_profiles d JOIN public.user_roles r
      ON r.user_id = d.user_id AND r.role = 'doctor' WHERE d.user_id = _user_id AND d.is_verified IS TRUE) THEN
    PERFORM docnow_private.cancel_revoked_doctor_visits(_user_id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_close_revoked_doctor_visits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_close_revoked_doctor_visits(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_patient_consultation(_consultation_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE doctor uuid := auth.uid();
BEGIN
  PERFORM 1 FROM public.doctor_profiles WHERE user_id = doctor AND is_available IS TRUE FOR UPDATE;
  IF NOT FOUND OR NOT public.is_authorized_doctor(doctor) THEN
    RAISE EXCEPTION 'Available verified doctor required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.consultations SET doctor_id = doctor, status = 'claimed', claimed_at = now()
    WHERE id = _consultation_id AND status = 'pending' AND doctor_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation is no longer available' USING ERRCODE = '40001'; END IF;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA docnow_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_account_access(), public.my_display_name(), public.my_booking_profile(),
  public.my_doctor_details(), public.my_visits(), public.my_waiting_visit(uuid), public.my_call_state(uuid,boolean),
  public.save_assigned_visit_summary(uuid,text,jsonb,text), public.admin_directory(),
  public.admin_edit_profile(uuid,text,text), public.admin_set_basic_role(uuid,public.app_role,boolean),
  public.admin_set_doctor_access(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_access(), public.my_display_name(), public.my_booking_profile(),
  public.my_doctor_details(), public.my_visits(), public.my_waiting_visit(uuid), public.my_call_state(uuid,boolean),
  public.save_assigned_visit_summary(uuid,text,jsonb,text), public.admin_directory(),
  public.admin_edit_profile(uuid,text,text), public.admin_set_basic_role(uuid,public.app_role,boolean),
  public.admin_set_doctor_access(uuid,boolean) TO authenticated;
