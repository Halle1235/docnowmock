-- Apply only after the published app and both video handlers pass release verification.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $cutover$
DECLARE target record;
BEGIN
  IF to_regprocedure('public.my_account_access()') IS NULL
     OR to_regprocedure('public.video_room_for_actor(uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Deploy the server actions before closing browser table access';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.consultations c LEFT JOIN docnow_private.video_rooms r ON r.consultation_id = c.id
    WHERE c.status IN ('claimed','in_progress') AND c.room_url IS NOT NULL AND r.consultation_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Drain active legacy video rooms before closing browser table access';
  END IF;

  FOR target IN
    SELECT c.relname, string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r','p')
      AND c.relname IN ('profiles','consultations','doctor_profiles','user_roles','audit_log',
                        'patient_journal_entries','test_bookings','visit_ready_email_queue')
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.relname);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target.relname);
    EXECUTE format('REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE public.%2$I FROM PUBLIC, anon, authenticated',
      target.columns, target.relname);
    IF has_any_column_privilege('authenticated', format('public.%I', target.relname), 'SELECT,INSERT,UPDATE,REFERENCES')
       OR has_any_column_privilege('anon', format('public.%I', target.relname), 'SELECT,INSERT,UPDATE,REFERENCES')
       OR has_table_privilege('authenticated', format('public.%I', target.relname), 'DELETE,TRUNCATE,TRIGGER')
       OR has_table_privilege('anon', format('public.%I', target.relname), 'DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'Inherited client grant on %', target.relname;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = target.relname) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', target.relname);
    END IF;
  END LOOP;
END;
$cutover$;

DROP TRIGGER IF EXISTS close_visits_on_doctor_role_removal ON public.user_roles;
DROP TRIGGER IF EXISTS close_visits_on_doctor_unverification ON public.doctor_profiles;
CREATE TRIGGER close_visits_on_doctor_role_removal AFTER DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION docnow_private.close_visits_on_doctor_revoke();
CREATE TRIGGER close_visits_on_doctor_unverification AFTER UPDATE OF is_verified ON public.doctor_profiles
FOR EACH ROW EXECUTE FUNCTION docnow_private.close_visits_on_doctor_revoke();

-- The owner still uses these helpers inside the scoped server actions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid,public.app_role), public.is_authorized_doctor(uuid),
  public.audit_patient_record_read(text,uuid), public.list_admin_profiles(),
  public.get_authorized_call_record(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
