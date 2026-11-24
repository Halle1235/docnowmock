/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Test the deployed handler source with fictional actors and a synthetic Daily boundary.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const shared = read("../supabase/functions/_shared/daily-rooms.ts").replace(/^export /gm, "");
const compile = (name: string) => ts.transpileModule(
  shared + "\n" + read(`../supabase/functions/${name}/index.ts`).replace(/^import [^\n]*\n/gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const joinSource = compile("create-daily-room");
const cleanupSource = compile("revoke-call-access");

const uuid = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const doctor = uuid(1), patient = uuid(2), outsider = uuid(3), admin = uuid(4), visit = uuid(5);
const room = "docnow-" + "a".repeat(32);
const origin = "https://fixture.daily.co";
const expiry = () => Math.floor(Date.now() / 1000) + 3600;
type Scenario = {
  actor?: string; action?: string; requestId?: string; auth?: boolean; cleanup?: boolean;
  absent?: boolean; reserved?: boolean; stale?: boolean; wrongIdentity?: boolean;
  expired?: boolean; cleanupFailure?: boolean; leaseActive?: boolean; revoked?: boolean;
  revokeAfterMint?: boolean;
};

async function request(scenario: Scenario = {}) {
  const actor = scenario.actor ?? doctor;
  const rpcCalls: string[] = [];
  const providerCalls: string[] = [];
  const timeline: string[] = [];
  const exp = scenario.expired ? 1 : expiry();
  let hasRoom = !scenario.absent && !scenario.reserved;
  let attached = !scenario.reserved;
  let closed = scenario.cleanup === true || scenario.stale === true;
  let cleaned = false;
  let generatedToken: Record<string, unknown> | undefined;
  const server = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push(name);
      timeline.push(name);
      assert.equal(name === "has_role" ? args._user_id : (args._actor ?? actor), actor);
      switch (name) {
        case "has_role": return { data: actor === admin };
        case "video_room_for_actor": {
          if (scenario.revoked || ![doctor, patient].includes(actor)) return { data: { state: "forbidden" } };
          if (closed) return { data: { state: "closed" } };
          if (!attached && actor !== doctor) return { data: { state: "waiting" } };
          return { data: {
            state: attached ? "ready" : "reserved", name: room, provider_id: attached ? "provider-room-id" : null,
            lease: attached ? null : uuid(6), expires_at: expiry(), is_doctor: actor === doctor,
          } };
        }
        case "attach_bound_video_room":
          assert.equal(args._room_url, `${origin}/${room}`);
          assert.equal(args._provider_id, "provider-room-id");
          attached = true;
          return { data: true };
        case "close_bound_video_room":
          if (actor !== doctor) return { data: false };
          closed = true;
          return { data: true };
        case "video_room_cleanup_targets":
          assert.ok(closed);
          assert.equal(scenario.cleanup ? args._doctor_id : args._consultation_id, scenario.cleanup ? doctor : visit);
          return { data: [{ consultation_id: visit, name: room, provider_id: "provider-room-id", lease_active: !!scenario.leaseActive }] };
        case "mark_video_room_cleaned":
          assert.ok(closed && !hasRoom);
          assert.equal(args._name, room);
          cleaned = true;
          return { data: true };
        case "video_room_cleanup_pending": return { data: !cleaned };
        default: throw new Error("Unexpected database call");
      }
    },
  };
  const user = {
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(actor, admin);
      assert.equal(name, "admin_close_revoked_doctor_visits");
      assert.equal(args._user_id, doctor);
      return { error: null };
    },
  };
  const createClient = (_url: string, key: string) => key === "test-service-key" ? server : user;
  const fakeFetch = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    assert.equal(new URL(url).origin, "https://api.daily.co");
    providerCalls.push(`${init.method} ${path}`);
    timeline.push(`${init.method} ${path}`);
    if (path === "/v1/rooms") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.name, room);
      assert.equal(body.privacy, "private");
      assert.equal(body.properties.eject_at_room_exp, true);
      hasRoom = true;
    } else if (path.endsWith("/meeting-tokens")) {
      generatedToken = JSON.parse(String(init.body)).properties;
      if (scenario.revokeAfterMint) closed = true;
      return Response.json({ token: "fictional-token" });
    } else if (path === `/v1/rooms/${room}`) {
      if (init.method === "GET") {
        if (!hasRoom) return new Response(null, { status: 404 });
        return Response.json({
          id: scenario.wrongIdentity ? "different-provider-id" : "provider-room-id",
          name: room, url: `${origin}/${room}`, privacy: "private", config: { exp },
        });
      }
      assert.ok(closed);
      if (init.method === "DELETE") {
        if (scenario.cleanupFailure) return new Response(null, { status: 503 });
        hasRoom = false;
      }
    } else {
      throw new Error("Unexpected provider call");
    }
    return Response.json({});
  };
  const env: Record<string, string> = {
    SUPABASE_URL: "https://backend.example.invalid", SUPABASE_ANON_KEY: "test-public-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key", DAILY_API_KEY: "test-daily-key", DAILY_ROOM_ORIGIN: origin,
  };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deno = { env: { get: (name: string) => env[name] }, serve: (fn: typeof handler) => { handler = fn; } };
  new Function("Deno", "createClient", "fetch", scenario.cleanup ? cleanupSource : joinSource)(deno, createClient, fakeFetch);
  assert.ok(handler);
  const response = await handler(new Request("https://app.example.invalid/function", {
    method: "POST", headers: scenario.auth === false ? {} : { Authorization: "Bearer fictional-session" },
    body: JSON.stringify(scenario.cleanup ? { doctorId: doctor } : { consultationId: scenario.requestId ?? visit, action: scenario.action }),
  }));
  return { status: response.status, body: await response.json(), rpcCalls, providerCalls, timeline, generatedToken, cleaned, closed };
}

for (const actor of [doctor, patient]) {
  test(`authorized participant joins an existing bound call without creating another room (${actor === doctor ? "doctor" : "patient"})`, async () => {
    const result = await request({ actor });
    assert.equal(result.status, 200);
    assert.equal(result.body.url, `${origin}/${room}`);
    assert.equal(result.generatedToken?.room_name, room);
    assert.equal(result.generatedToken?.is_owner, actor === doctor);
    assert.equal(result.generatedToken?.user_id, actor);
    assert.equal(result.generatedToken?.eject_at_token_exp, true);
    assert.equal(result.providerCalls.length, 2);
    assert.deepEqual(result.rpcCalls, ["video_room_for_actor", "video_room_for_actor"]);
  });
}

test("anonymous and unrelated accounts receive no provider credentials", async () => {
  for (const [scenario, status] of [[{ auth: false }, 401], [{ actor: outsider }, 403], [{ actor: admin }, 403]] as const) {
    const result = await request(scenario);
    assert.equal(result.status, status);
    assert.equal(result.body.token, undefined);
    assert.deepEqual(result.providerCalls, []);
  }
});

test("a revoked doctor is denied before calling Daily", async () => {
  const result = await request({ revoked: true });
  assert.equal(result.status, 403);
  assert.deepEqual(result.providerCalls, []);
});

test("a concurrent revocation discards an issued credential before returning it to the browser", async () => {
  const result = await request({ revokeAfterMint: true });
  assert.equal(result.status, 410);
  assert.equal(result.body.token, undefined);
  assert.deepEqual(result.rpcCalls, ["video_room_for_actor", "video_room_for_actor"]);
});

test("invalid consultation input reaches neither boundary", async () => {
  const result = await request({ requestId: "invalid" });
  assert.equal(result.status, 400);
  assert.deepEqual(result.rpcCalls, []);
  assert.deepEqual(result.providerCalls, []);
});

test("patient waits while a private room is being provisioned", async () => {
  const result = await request({ actor: patient, reserved: true });
  assert.equal(result.status, 409);
  assert.deepEqual(result.providerCalls, []);
});

test("the assigned doctor attaches the reserved room before receiving credentials", async () => {
  const result = await request({ reserved: true });
  assert.equal(result.status, 200);
  assert.equal(result.providerCalls.filter((call) => call === "POST /v1/rooms").length, 1);
  assert.ok(result.timeline.indexOf("attach_bound_video_room") < result.timeline.indexOf("POST /v1/meeting-tokens"));
});

test("a closed, expired, or missing room can never mint a new token", async () => {
  for (const scenario of [{ stale: true }, { expired: true }, { absent: true }]) {
    const result = await request(scenario);
    assert.equal(result.status, 410);
    assert.equal(result.body.token, undefined);
    assert.ok(result.providerCalls.every((call) => call.startsWith("GET ")));
  }
});

test("provider identity mismatch fails closed for join and cleanup", async () => {
  for (const scenario of [{ wrongIdentity: true }, { wrongIdentity: true, action: "end" }]) {
    const result = await request(scenario);
    assert.equal(result.status, 503);
    assert.ok(result.providerCalls.every((call) => call.startsWith("GET ")));
  }
});

test("doctor ending commits consultation closure before Daily deletion", async () => {
  const result = await request({ action: "end" });
  assert.equal(result.status, 200);
  assert.ok(result.cleaned);
  assert.ok(result.timeline.indexOf("close_bound_video_room") < result.timeline.indexOf(`DELETE /v1/rooms/${room}`));
});

test("patients cannot end their consultation's room", async () => {
  const result = await request({ actor: patient, action: "end" });
  assert.equal(result.status, 403);
  assert.deepEqual(result.providerCalls, []);
});

test("cleanup retries stay available without reopening the visit", async () => {
  const failed = await request({ action: "end", cleanupFailure: true });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.cleanupPending, true);
  assert.equal(failed.closed, true);
  assert.equal(failed.cleaned, false);
  assert.equal((await request({ action: "end", stale: true })).status, 200);
});

test("admin cleanup reports unfinished provider work and requires an admin", async () => {
  const forbidden = await request({ cleanup: true, actor: patient });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.providerCalls, []);
  const failed = await request({ cleanup: true, actor: admin, cleanupFailure: true });
  assert.equal(failed.body.pending, true);
  assert.equal(failed.cleaned, false);
  const done = await request({ cleanup: true, actor: admin });
  assert.equal(done.body.pending, false);
  assert.equal(done.cleaned, true);
});

test("an active provisioning lease keeps a terminal room on the cleanup list", async () => {
  const result = await request({ cleanup: true, actor: admin, leaseActive: true });
  assert.equal(result.body.pending, true);
  assert.deepEqual(result.providerCalls, []);
});
