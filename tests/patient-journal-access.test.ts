import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// Execute the deployed RPC boundary without logging credentials or clinical content.
const settings = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter(line => line.includes("=")).map(line => {
  const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")];
}));
const session = JSON.parse(readFileSync(`${homedir()}/.cache/lovable-auth/session.json`, "utf8")).session;
async function rpc(name: string, body: object, signedIn: boolean) {
  const response = await fetch(`${settings.VITE_SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: settings.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json", ...(signedIn ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify(body) });
  await response.text(); return response.status;
}
const id = "00000000-0000-4000-8000-000000000000";
test("anonymous visitors cannot read the persistent patient journal", async () => {
  assert.ok([401, 403].includes(await rpc("list_patient_journal", { _consultation_id: id }, false)));
});
test("signed-in patient cannot access another consultation's journal", async () => {
  assert.equal(await rpc("list_patient_journal", { _consultation_id: id }, true), 403);
});
test("signed-in patient cannot author clinical journal entries", async () => {
  assert.equal(await rpc("add_patient_journal_entry", { _consultation_id: id, _diagnosis: "", _treatment: "", _notes: "Denied probe" }, true), 403);
});
test("caller-supplied patient and doctor identities are not accepted", async () => {
  assert.equal(await rpc("add_patient_journal_entry", { _consultation_id: id, _diagnosis: "", _treatment: "", _notes: "Denied probe", patient_id: session.user.id, doctor_id: session.user.id }, true), 404);
});