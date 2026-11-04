REVOKE EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated,service_role;
-- Data API GET uses read-only transactions. Staff use POST RPCs; self reads remain usable.
ALTER POLICY "Audited staff profile reads" ON public.profiles USING
(CASE WHEN current_setting('transaction_read_only')='off' THEN public.audit_patient_record_read('profiles',id) ELSE false END);
ALTER POLICY "Audited assigned doctor and admin reads" ON public.consultations USING
(CASE WHEN current_setting('transaction_read_only')='off' THEN public.audit_patient_record_read('consultations',id) ELSE false END);
-- Direct draft reads also fail closed when an audit entry cannot be written.
CREATE OR REPLACE FUNCTION public.audit_summary_draft_read(_consultation_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public
AS $$ BEGIN
 IF NOT public.is_authorized_doctor(auth.uid()) OR NOT EXISTS
 (SELECT 1 FROM public.consultations WHERE id=_consultation_id AND doctor_id=auth.uid()) THEN RETURN false; END IF;
 INSERT INTO public.audit_log(actor_id,table_name,record_id,action)
 VALUES(auth.uid(),'visit_summary_drafts',_consultation_id::text,'SELECT');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.audit_summary_draft_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.audit_summary_draft_read(uuid) TO authenticated;
DROP POLICY "Verified doctor manages assigned drafts" ON public.visit_summary_drafts;
CREATE POLICY "Audited assigned draft reads" ON public.visit_summary_drafts FOR SELECT TO authenticated
USING (CASE WHEN current_setting('transaction_read_only')='off' THEN public.audit_summary_draft_read(consultation_id) ELSE false END);
CREATE POLICY "Verified doctor inserts assigned drafts" ON public.visit_summary_drafts FOR INSERT TO authenticated
WITH CHECK (public.is_authorized_doctor(auth.uid()) AND EXISTS
(SELECT 1 FROM public.consultations WHERE id=consultation_id AND doctor_id=auth.uid()));
CREATE POLICY "Verified doctor updates assigned drafts" ON public.visit_summary_drafts FOR UPDATE TO authenticated
USING (public.is_authorized_doctor(auth.uid()) AND EXISTS
(SELECT 1 FROM public.consultations WHERE id=consultation_id AND doctor_id=auth.uid()))
WITH CHECK (public.is_authorized_doctor(auth.uid()) AND EXISTS
(SELECT 1 FROM public.consultations WHERE id=consultation_id AND doctor_id=auth.uid()));
CREATE POLICY "Verified doctor deletes assigned drafts" ON public.visit_summary_drafts FOR DELETE TO authenticated
USING (public.is_authorized_doctor(auth.uid()) AND EXISTS
(SELECT 1 FROM public.consultations WHERE id=consultation_id AND doctor_id=auth.uid()));