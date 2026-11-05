CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.profiles(id,full_name,email) VALUES(NEW.id,left(coalesce(NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'name',''),120),coalesce(NEW.email,'')) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.user_roles(user_id,role) VALUES(NEW.id,'patient') ON CONFLICT(user_id,role) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_real_account_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();