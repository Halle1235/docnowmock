import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import ts from "typescript";

function readFunction(path: string) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8").replace(/^import [^\n]*\n/gm, "").replace(/^export /gm, ""),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
}
const source = readFunction("../supabase/functions/_shared/cron-auth.ts") +
  readFunction("../supabase/functions/send-visit-ready-emails/index.ts");

async function invoke(authorization: string, providerStatus = 200, appUrl = "https://docnow.example.invalid") {
  let handler: (request: Request) => Promise<Response> = async () => { throw new Error("Handler missing"); };
  let claimed = 0;
  const marked: string[] = [];
  const messages: { url: string; init: RequestInit }[] = [];
  const id = "11111111-1111-4111-8111-111111111111";
  const env: Record<string, string> = {
    LOVABLE_CRON_SECRET: "synthetic-cron-secret",
    RESEND_API_KEY: "synthetic-key",
    DOCNOW_EMAIL_FROM: "info@example.invalid",
    DOCNOW_APP_URL: appUrl,
    SUPABASE_URL: "https://database.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
  };
  const client = {
    rpc: async (name: string) => {
      assert.equal(name, "claim_visit_ready_emails");
      claimed++;
      return { data: [{ consultation_id: id, email: "patient@example.invalid" }], error: null };
    },
    from: (table: string) => ({
      update: ({ sent_at }: { sent_at: string }) => ({
        eq: async (column: string, value: string) => {
          assert.equal(table, "visit_ready_email_queue");
          assert.equal(column, "consultation_id");
          assert.ok(Number.isFinite(Date.parse(sent_at)));
          marked.push(value);
          return { error: null };
        },
      }),
    }),
  };
  const fetchEmail = async (url: string, init: RequestInit) => {
    messages.push({ url, init });
    return new Response(null, { status: providerStatus });
  };
  new Function("Deno", "createClient", "fetch", "createHash", "timingSafeEqual", source)(
    { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    () => client, fetchEmail, createHash, timingSafeEqual,
  );
  const response = await handler(new Request("https://worker.example.invalid", { method: "POST", headers: { authorization } }));
  return { response, messages, marked, claimed, id };
}

const authorized = "Bearer synthetic-cron-secret";

test("a visitor cannot read the email queue or trigger delivery", async () => {
  const result = await invoke("Bearer synthetic-visitor");
  assert.equal(result.response.status, 401);
  assert.equal(result.claimed, 0);
  assert.equal(result.messages.length, 0);
});

test("ready email uses the verified account address and a generic sign-in link", async () => {
  const result = await invoke(authorized);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.marked, [result.id]);
  const [message] = result.messages;
  assert.equal(message.url, "https://api.resend.com/emails");
  assert.equal(new Headers(message.init.headers).get("Idempotency-Key"), `visit-ready/${result.id}`);
  assert.deepEqual(JSON.parse(String(message.init.body)), {
    from: "info@example.invalid",
    to: ["patient@example.invalid"],
    subject: "You have an update from DocNow",
    text: "Sign in to DocNow to view your latest update.\n\nhttps://docnow.example.invalid/auth?as=patient",
  });
});

test("failed provider delivery remains eligible for retry", async () => {
  const result = await invoke(authorized, 429);
  assert.equal(result.response.status, 502);
  assert.deepEqual(result.marked, []);
  assert.deepEqual(await result.response.json(), { sent: 0, failed: 1 });
});

test("an invalid app configuration does not claim queued email", async () => {
  const result = await invoke(authorized, 200, "invalid");
  assert.equal(result.response.status, 503);
  assert.equal(result.claimed, 0);
});
