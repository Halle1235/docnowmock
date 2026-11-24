/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";

const source = readFileSync(new URL("../supabase/functions/admin-create-doctor/index.ts", import.meta.url), "utf8")
  .replace(/^import [^\n]*\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function invoke(options: { code?: string; message?: string; admin?: boolean; auth?: boolean } = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const writes: string[] = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "synthetic-admin" } }, error: null }),
      admin: {
        createUser: async () => {
          writes.push("createUser");
          return { data: { user: null }, error: { code: options.code ?? "email_exists", message: options.message ?? "Duplicate email" } };
        },
        deleteUser: async () => { writes.push("deleteUser"); },
        updateUserById: async () => { writes.push("updateUser"); },
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.admin === false ? null : { id: "admin-role" } }) }) }) }),
      insert: async () => { writes.push("insert"); return { error: null }; },
      update: async () => { writes.push("update"); },
    }),
  };
  new Function("Deno", "createClient", "z", compiled)(
    { env: { get: () => "synthetic-only" }, serve: (fn: typeof handler) => { handler = fn; } },
    () => client, z,
  );
  assert.ok(handler);
  const response = await handler(new Request("https://app.invalid/admin-create-doctor", {
    method: "POST",
    headers: options.auth === false ? {} : { Authorization: "Bearer synthetic-only" },
    body: JSON.stringify({ full_name: "Fictional Doctor", email: "doctor@example.invalid", password: "synthetic-password-only", license_number: "TEST-ONLY", specialization: "Test" }),
  }));
  return { status: response.status, body: await response.json(), writes };
}

for (const code of ["email_exists", "user_already_exists"]) {
  test(`duplicate ${code} returns a conflict without modifying the existing account`, async () => {
    const result = await invoke({ code });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "EMAIL_ALREADY_REGISTERED");
    assert.deepEqual(result.writes, ["createUser"]);
  });
}
test("legacy duplicate email errors also return a safe conflict", async () => {
  const result = await invoke({ code: "legacy", message: "A user with this email address has already been registered" });
  assert.equal(result.status, 409);
  assert.deepEqual(result.writes, ["createUser"]);
});
test("non-admin cannot create or modify doctor accounts", async () => {
  const result = await invoke({ admin: false });
  assert.equal(result.status, 403);
  assert.deepEqual(result.writes, []);
});
test("anonymous requests never reach account creation", async () => {
  const result = await invoke({ auth: false });
  assert.equal(result.status, 401);
  assert.deepEqual(result.writes, []);
});
test("unrelated account errors are not misclassified as duplicates", async () => {
  const result = await invoke({ code: "weak_password", message: "Password rejected" });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, undefined);
  assert.deepEqual(result.writes, ["createUser"]);
});