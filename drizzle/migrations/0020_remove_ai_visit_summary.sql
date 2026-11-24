DO $remove_ai_visit_summary$
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);
  LOCK TABLE public.consultations IN ACCESS EXCLUSIVE MODE;
  IF to_regclass('public.visit_summary_drafts') IS NOT NULL THEN
    LOCK TABLE public.visit_summary_drafts IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM public.visit_summary_drafts) THEN
      RAISE EXCEPTION 'Preserve legacy visit summary drafts before removing AI summary storage';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.consultations'::regclass
      AND attname = 'visit_summary_generated_at' AND NOT attisdropped
  ) THEN
    IF EXISTS (SELECT 1 FROM public.consultations WHERE visit_summary_generated_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Preserve legacy summary generation metadata before removing AI summary storage';
    END IF;
  END IF;

  DROP FUNCTION IF EXISTS public.get_authorized_summary_draft(uuid);
  DROP TABLE IF EXISTS public.visit_summary_drafts;
  DROP FUNCTION IF EXISTS public.audit_summary_draft_read(uuid);
  ALTER TABLE public.consultations DROP COLUMN IF EXISTS visit_summary_generated_at;
END;
$remove_ai_visit_summary$;
