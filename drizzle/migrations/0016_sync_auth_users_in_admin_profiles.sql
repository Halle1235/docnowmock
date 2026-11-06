-- Migration 0016: Ensure all auth.users are synced into public.profiles and visible in Admin Dashboard

CREATE OR REPLACE FUNCTION public.list_admin_profiles()
RETURNS SETOF public.profiles LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public
AS $$
DECLARE p record;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;

 -- Automatically sync any user from auth.users that does not yet have a profile
 INSERT INTO public.profiles(id, full_name, email)
 SELECT
   u.id,
   left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), 120),
   coalesce(u.email, '')
 FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
 ON CONFLICT (id) DO NOTHING;

 -- Ensure they have default patient role if no role assigned
 INSERT INTO public.user_roles(user_id, role)
 SELECT u.id, 'patient'
 FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
 ON CONFLICT (user_id, role) DO NOTHING;

 FOR p IN SELECT id FROM public.profiles LOOP
   PERFORM public.audit_patient_record_read('profiles', p.id);
 END LOOP;

 RETURN QUERY SELECT * FROM public.profiles ORDER BY full_name;
END $$;

REVOKE ALL ON FUNCTION public.list_admin_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;

