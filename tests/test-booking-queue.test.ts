import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Inspect effective database privileges without writing to the retired queue.
// The RPC grants are checked in patient-record-access.test.ts.
test("app visitors have no direct access to the retired queue table", () => {
  const query = `
    SELECT bool_and(NOT has_table_privilege(app_role, 'public.test_bookings', privilege))
    FROM unnest(ARRAY['anon', 'authenticated']) AS roles(app_role)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS privileges(privilege)
  `;
  const result = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-Atc", query], { encoding: "utf8" });
  assert.equal(result.trim(), "t");
});
