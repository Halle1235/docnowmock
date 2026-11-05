import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function definition() {
  return execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atc', "SELECT pg_get_functiondef('public.book_unpaid_consultation(jsonb,jsonb)'::regprocedure)"], { encoding: 'utf8' });
}
test('unpaid booking derives patient and pending payment with AED 249 on the server', () => {
  const sql = definition();
  assert.match(sql, /patient uuid:=auth.uid\(\)/);
  assert.match(sql, /VALUES\(patient,'pending','pending',249/);
  assert.doesNotMatch(sql, /_intake->>'payment/);
});
test('unpaid bookings require all consent checks and server-derived consent timestamps', () => {
  const sql = definition();
  for (const key of ['emergency', 'telehealth', 'privacy']) assert.ok(sql.includes(`(_reason->'${key}') IS DISTINCT FROM 'true'::jsonb`));
  assert.match(sql, /now\(\),now\(\),now\(\),'2026-11-v1'/);
});
test('unpaid booking serializes requests and returns an existing active visit', () => {
  const sql = definition();
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /status IN \('pending','claimed','in_progress'\)/);
  assert.match(sql, /IF visit_id IS NOT NULL THEN RETURN visit_id/);
});
test('unpaid booking requires patient role and is not executable anonymously', () => {
  const sql = definition();
  assert.match(sql, /NOT public.has_role\(patient,'patient'\)/);
  assert.match(sql, /public.has_role\(patient,'doctor'\)/);
  const allowed = execFileSync('psql', ['-X', '-Atc', "SELECT NOT has_function_privilege('anon','public.book_unpaid_consultation(jsonb,jsonb)','EXECUTE') AND has_function_privilege('authenticated','public.book_unpaid_consultation(jsonb,jsonb)','EXECUTE')"], { encoding: 'utf8' }).trim();
  assert.equal(allowed, 't');
});