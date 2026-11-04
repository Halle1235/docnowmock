ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS room_closed_at timestamptz;
CREATE OR REPLACE FUNCTION public.guard_terminal_consultation_room() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.status IN ('completed','cancelled') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.room_url IS DISTINCT FROM OLD.room_url) THEN
  RAISE EXCEPTION 'An ended consultation cannot reopen or replace its room' USING ERRCODE='42501';
 END IF;
 IF OLD.room_closed_at IS NOT NULL AND NEW.room_closed_at IS DISTINCT FROM OLD.room_closed_at THEN
  RAISE EXCEPTION 'Room closure cannot be reversed' USING ERRCODE='42501';
 END IF;
 IF NEW.status IN ('completed','cancelled') THEN NEW.room_closed_at := COALESCE(OLD.room_closed_at,now()); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_guard_terminal_consultation_room BEFORE UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.guard_terminal_consultation_room();