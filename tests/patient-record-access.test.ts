/// <reference types="node" />
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";

// Integration checks against deployed catalog permissions; never read patient content.
function check(sql: string) {
  const result = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
  assert.equal(result, "t");
}
test("anonymous visitors cannot read patient records", () => check("SELECT NOT has_table_privilege('anon','public.profiles','SELECT') AND NOT has_table_privilege('anon','public.consultations','SELECT')"));
test("clients cannot forge or erase audit entries", () => check("SELECT NOT has_table_privilege('authenticated','public.audit_log','INSERT') AND NOT has_table_privilege('authenticated','public.audit_log','UPDATE') AND NOT has_table_privilege('authenticated','public.audit_log','DELETE')"));
test("staff record RPCs require authentication", () => check("SELECT bool_and(NOT has_function_privilege('anon',oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('list_doctor_consultations','list_admin_profiles','claim_patient_consultation','get_consultation_patient','get_authorized_call_record','get_authorized_summary_draft')"));
test("patients retain their own consultation access", () => check("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='consultations' AND cmd='SELECT' AND qual='(auth.uid() = patient_id)')"));
test("staff patient profile and consultation reads require audit writes", () => check("SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','consultations') AND cmd='SELECT' AND qual LIKE '%audit_patient_record_read%'"));
test("unassigned doctors cannot directly read pending clinical records", () => check("SELECT NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='consultations' AND cmd='SELECT' AND qual LIKE '%pending%')"));
test("clinical changes have audit triggers", () => check("SELECT count(DISTINCT c.relname)=3 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgfoid='public.write_audit_log()'::regprocedure AND c.relname IN ('profiles','consultations','visit_summary_drafts')"));
test("consultation update guard remains installed", () => check("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.consultations'::regclass AND tgfoid='public.guard_consultation_update()'::regprocedure AND tgenabled='O')"));
test("doctor authorization requires role and verification", () => check("SELECT pg_get_functiondef('public.is_authorized_doctor(uuid)'::regprocedure) LIKE '%has_role(_user_id, ''doctor''%' AND pg_get_functiondef('public.is_authorized_doctor(uuid)'::regprocedure) LIKE '%is_verified IS TRUE%'"));