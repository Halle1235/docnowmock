/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function check(sql: string) {
  const result = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
  assert.equal(result, "t");
}

test("application roles have no protected table or column access after cutover", () => check(`
  SELECT count(*) >= 7 AND bool_and(relrowsecurity
    AND NOT has_any_column_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,REFERENCES')
    AND NOT has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES')
    AND NOT has_table_privilege('authenticated', oid, 'DELETE,TRUNCATE,TRIGGER')
    AND NOT has_table_privilege('anon', oid, 'DELETE,TRUNCATE,TRIGGER'))
  FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p')
    AND relname IN ('profiles','consultations','doctor_profiles','user_roles','audit_log',
                    'patient_journal_entries','test_bookings','visit_ready_email_queue')
`));

test("the old role lookup and room lookup are unavailable to browsers", () => check(`
  SELECT bool_and(NOT has_function_privilege('authenticated', oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', oid, 'EXECUTE'))
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('has_role','is_authorized_doctor','get_authorized_call_record','list_admin_profiles',
                    'video_room_for_actor','attach_bound_video_room','close_bound_video_room','video_room_cleanup_targets')
`));

test("private room bindings are unavailable to app roles", () => check(`
  SELECT NOT has_schema_privilege('authenticated', 'docnow_private', 'USAGE')
    AND NOT has_schema_privilege('anon', 'docnow_private', 'USAGE')
    AND NOT has_any_column_privilege('authenticated', 'docnow_private.video_rooms', 'SELECT,INSERT,UPDATE')
`));
