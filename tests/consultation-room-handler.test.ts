/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual edge handler with fake identity/provider boundaries.
// No network, real credentials, or real video rooms are used by this suite.
const source = readFileSync(new URL("../supabase/functions/create-daily-room/index.ts", import.meta.url), "utf8")
  .replace(/^import .* from "https:\/\/[^\n]+;\n/gm, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const doctorA = "10000000-0000-4000-8000-000000000001";
const patientA = "10000000-0000-4000-8000-000000000002";
const doctorB = "10000000-0000-4000-8000-000000000003";
const patientB = "10000000-0000-4000-8000-000000000004";
const admin = "10000000-0000-4000-8000-000000000005";
const roomA = { id: "20000000-0000-4000-8000-000000000001", doctor_id: doctorA, patient_id: patientA, status: "in_progress", room_url: "https://test.daily.co/consultation-a" };
const roomB = { id: "20000000-0000-4000-8000-000000000002", doctor_id: doctorB, patient_id: patientB, status: "in_progress", room_url: "https://test.daily.co/consultation-b" };
type RecordData = typeof roomA;
type ProviderCall = { url: string; body: Record<string, unknown> };
async function requestAs(user: string | null, record: RecordData | null, options: { auth?: boolean; invalidSession?: boolean; consultationId?: string; action?: string; expired?: boolean; missingRoom?: boolean; cleanupFailure?: boolean } = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const calls: ProviderCall[] = [];
  const rpcIds: string[] = [];
  const updates: Array<{ id: string; value: unknown }> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: options.invalidSession ? new Error("Invalid session") : null }) },
    rpc: async (name: string, args: { _consultation_id: string }) => {
      assert.equal(name, "get_authorized_call_record"); rpcIds.push(args._consultation_id);
      return { data: record, error: record ? null : { code: "42501" } };
    },
    from: (table: string) => {
      assert.equal(table, "consultations");
      return { update: (value: unknown) => ({ eq: async (_column: string, id: string) => { updates.push({ id, value }); return { error: null }; } }) };
    },
  };
  const fakeFetch = async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ url, body });
    if (!init.method) return new Response(JSON.stringify({ config: { exp: options.expired ? 1 : Math.floor(Date.now() / 1000) + 7200 } }), { status: options.missingRoom ? 404 : 200 });
    if (options.action === "end") return new Response("{}", { status: options.cleanupFailure ? 500 : 200 });
    return new Response(JSON.stringify(url.endsWith("/meeting-tokens") ? { token: "synthetic-token" } : { name: body.name, url: `https://test.daily.co/${body.name}` }), { status: 200 });
  };
  const deno = { env: { get: () => "synthetic-test-only" }, serve: (fn: typeof handler) => { handler = fn; } };
  new Function("Deno", "createClient", "corsHeaders", "fetch", compiled)(deno, () => client, {}, fakeFetch);
  assert.ok(handler);
  const response = await handler(new Request("https://app.invalid/create-daily-room", {
    method: "POST", headers: options.auth === false ? {} : { Authorization: "Bearer synthetic-session" },
    body: JSON.stringify({ consultationId: options.consultationId ?? record?.id ?? roomA.id, action: options.action }),
  }));
  const body = await response.json();
  return { status: response.status, body, calls, rpcIds, updates };
}

for (const [label, user, record, owner] of [
  ["assigned doctor A", doctorA, roomA, true], ["assigned patient A", patientA, roomA, false],
  ["assigned doctor B", doctorB, roomB, true], ["assigned patient B", patientB, roomB, false],
] as const) {
  test(`${label} receives credentials only for their consultation room`, async () => {
    const result = await requestAs(user, record);
    assert.equal(result.status, 200); assert.equal(result.body.url, record.room_url);
    assert.deepEqual(result.rpcIds, [record.id]); assert.equal(result.calls.length, 2);
    assert.equal(result.calls[1].url, "https://api.daily.co/v1/meeting-tokens");
    const props = result.calls[1].body.properties as Record<string, unknown>;
    assert.equal(props.room_name, new URL(record.room_url).pathname.slice(1));
    assert.equal(props.user_id, user); assert.equal(props.is_owner, owner);
    assert.equal(props.eject_at_token_exp, true); assert.ok(Number(props.exp) > Date.now() / 1000);
    assert.deepEqual(result.updates, []);
  });
}
for (const [label, user, record] of [
  ["doctor B cannot enter room A", doctorB, roomA], ["patient B cannot enter room A", patientB, roomA],
  ["doctor A cannot enter room B", doctorA, roomB], ["patient A cannot enter room B", patientA, roomB],
  ["unassigned administrator cannot enter room A", admin, roomA],
] as const) {
  test(label, async () => {
    // Even if the record layer incorrectly returns a record, the handler must reject outsiders.
    const result = await requestAs(user, record);
    assert.equal(result.status, 403); assert.equal(result.body.token, undefined);
    assert.deepEqual(result.calls, []); assert.deepEqual(result.updates, []);
  });
}
test("authorization RPC denial never issues credentials", async () => {
  const result = await requestAs(doctorB, null);
  assert.equal(result.status, 403); assert.deepEqual(result.calls, []);
});
test("anonymous visitors cannot obtain room credentials", async () => {
  const result = await requestAs(null, roomA, { auth: false });
  assert.equal(result.status, 401); assert.deepEqual(result.rpcIds, []); assert.deepEqual(result.calls, []);
});
test("invalid sessions cannot obtain room credentials", async () => {
  const result = await requestAs(doctorA, roomA, { invalidSession: true });
  assert.equal(result.status, 401); assert.deepEqual(result.rpcIds, []); assert.deepEqual(result.calls, []);
});
test("assigned patient must wait until the doctor creates their room", async () => {
  const result = await requestAs(patientA, { ...roomA, status: "claimed", room_url: "" });
  assert.equal(result.status, 409); assert.deepEqual(result.calls, []); assert.deepEqual(result.updates, []);
});
test("only assigned doctor creates a private room bound to the consultation", async () => {
  const result = await requestAs(doctorA, { ...roomA, status: "claimed", room_url: "" });
  assert.equal(result.status, 200); assert.equal(result.calls.length, 2);
  const created = result.calls[0].body;
  assert.equal(created.privacy, "private");
  assert.equal((result.calls[1].body.properties as Record<string, unknown>).room_name, created.name);
  assert.deepEqual(result.updates, [{ id: roomA.id, value: { room_url: result.body.url, status: "in_progress" } }]);
});
test("completed consultations do not issue room credentials", async () => {
  const result = await requestAs(doctorA, { ...roomA, status: "completed" });
  assert.equal(result.status, 410); assert.deepEqual(result.calls, []);
});
test("invalid consultation identifiers never reach authorization or the video provider", async () => {
  const result = await requestAs(doctorA, roomA, { consultationId: "another-room" });
  assert.equal(result.status, 400); assert.deepEqual(result.rpcIds, []); assert.deepEqual(result.calls, []);
});
for (const user of [doctorA, patientA]) test(`expired room rejects participant ${user}`, async () => {
 const result = await requestAs(user, roomA, { expired: true });
 assert.equal(result.status, 410); assert.equal(result.body.token, undefined);
 assert.equal(result.calls.filter(c => c.url.endsWith("meeting-tokens")).length, 0);
});
test("deleted room never creates a replacement on rejoin", async () => {
 const result = await requestAs(doctorA, roomA, { missingRoom: true });
 assert.equal(result.status, 410); assert.deepEqual(result.updates, []);
});
test("doctor end closes authorization before deleting the room", async () => {
 const result = await requestAs(doctorA, roomA, { action: "end" });
 assert.equal(result.status, 200); assert.equal(result.body.ended, true);
 assert.equal((result.updates[0].value as {status:string}).status, "completed");
 assert.equal(result.calls.length, 1);
});
test("patient cannot end or delete the consultation room", async () => {
 const result = await requestAs(patientA, roomA, { action: "end" });
 assert.equal(result.status, 403); assert.deepEqual(result.calls, []); assert.deepEqual(result.updates, []);
});
test("cleanup failure is reported after authorization is closed", async () => {
 const result = await requestAs(doctorA, roomA, { action: "end", cleanupFailure: true });
 assert.equal(result.status, 500);
 assert.equal((result.updates[0].value as {status:string}).status, "completed");
});
test("ending an already completed consultation retries cleanup without reopening", async () => {
 const result = await requestAs(doctorA, {...roomA,status:"completed"}, { action: "end" });
 assert.equal(result.status, 200); assert.deepEqual(result.updates, []); assert.equal(result.calls.length,2);
});
