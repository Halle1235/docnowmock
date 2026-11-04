-- Temporary no-login test queue: only a display name and visit reason, auto-expiring, reached only via bounded functions.
CREATE TABLE public.test_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL CHECK (char_length(patient_name) BETWEEN 1 AND 80),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '3 hours'
);
GRANT ALL ON public.test_bookings TO service_role;
ALTER TABLE public.test_bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX test_bookings_active ON public.test_bookings (status, created_at);
COMMENT ON TABLE public.test_bookings IS 'Temporary public test queue for mock-login mode. Never store real health records here.';

CREATE OR REPLACE FUNCTION public.create_test_booking(_name text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n text := btrim(coalesce(_name, '')); r text := btrim(coalesce(_reason, '')); new_id uuid;
BEGIN
  IF char_length(n) NOT BETWEEN 1 AND 80 OR char_length(r) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Invalid booking details' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.test_bookings WHERE expires_at < now();
  IF (SELECT count(*) FROM public.test_bookings WHERE status = 'pending') >= 30 THEN
    RAISE EXCEPTION 'Test queue is full, try again later' USING ERRCODE = '53400';
  END IF;
  INSERT INTO public.test_bookings (patient_name, reason) VALUES (n, r) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_test_bookings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'patient_name', patient_name, 'reason', reason, 'status', status, 'created_at', created_at) ORDER BY created_at), '[]'::jsonb)
  FROM (SELECT * FROM public.test_bookings WHERE expires_at > now() AND status IN ('pending','claimed') ORDER BY created_at LIMIT 50) b
$$;

CREATE OR REPLACE FUNCTION public.get_test_booking(_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('status', status, 'doctor_name', CASE WHEN status <> 'pending' THEN 'Dr. Alex Morgan' END)
  FROM public.test_bookings WHERE id = _id AND expires_at > now()
$$;

CREATE OR REPLACE FUNCTION public.claim_test_booking(_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.test_bookings SET status = 'claimed', claimed_at = now()
  WHERE id = _id AND status = 'pending' AND expires_at > now();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.complete_test_booking(_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.test_bookings SET status = 'completed' WHERE id = _id AND status = 'claimed';
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.create_test_booking(text, text), public.list_test_bookings(), public.get_test_booking(uuid), public.claim_test_booking(uuid), public.complete_test_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_test_booking(text, text), public.list_test_bookings(), public.get_test_booking(uuid), public.claim_test_booking(uuid), public.complete_test_booking(uuid) TO anon, authenticated, service_role;