import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("deployed doctor listing keeps its audit record distinct from the query alias", () => {
  const definition = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-Atc", "SELECT pg_get_functiondef('public.list_doctor_consultations()'::regprocedure)"], { encoding: "utf8" });
  assert.match(definition, /assigned_visit record/);
  assert.doesNotMatch(definition, /\bc record/);
  assert.match(definition, /audit_patient_record_read\('profiles',assigned_visit.patient_id\)/);
  assert.match(definition, /is_authorized_doctor\(auth.uid\(\)\)/);
});