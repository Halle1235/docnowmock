import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("verified doctor consultation listing executes without alias ambiguity and outsiders remain denied", () => {
  const result = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-Atc", `
    BEGIN;
    DO $$ DECLARE doctor uuid; output jsonb; BEGIN
      SELECT d.user_id INTO doctor FROM public.doctor_profiles d
      WHERE d.is_verified IS TRUE AND public.has_role(d.user_id,'doctor') LIMIT 1;
      IF doctor IS NULL THEN RAISE EXCEPTION 'A verified doctor is required for this regression test'; END IF;
      PERFORM set_config('request.jwt.claim.sub',doctor::text,true);
      PERFORM set_config('request.jwt.claim.role','authenticated',true);
      output := public.list_doctor_consultations();
      IF jsonb_typeof(output) <> 'array' THEN RAISE EXCEPTION 'Expected consultation array'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(output) item WHERE item->>'patient_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations visit WHERE visit.id=(item->>'id')::uuid AND visit.doctor_id=doctor
      )) THEN RAISE EXCEPTION 'Unassigned patient identity exposed'; END IF;
      PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
      BEGIN
        PERFORM public.list_doctor_consultations();
        RAISE EXCEPTION 'Outsider was allowed';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END $$;
    SELECT 'passed';
    ROLLBACK;
  `], { encoding: "utf8" });
  assert.ok(result.split(/\s+/).includes("passed"));
});