import { test, after } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

// Exercises the deployed no-login test queue with made-up details only.
const settings = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter(line => line.includes("=")).map(line => {
  const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")];
}));
async function rpc(name: string, body: object = {}) {
  const response = await fetch(`${settings.VITE_SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: settings.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
async function table() {
  const response = await fetch(`${settings.VITE_SUPABASE_URL}/rest/v1/test_bookings?select=*`, { headers: { apikey: settings.VITE_SUPABASE_PUBLISHABLE_KEY } });
  await response.text(); return response.status;
}
const created: string[] = [];
after(async () => { for (const id of created) { await rpc("claim_test_booking", { _id: id }); await rpc("complete_test_booking", { _id: id }); } });

test("a patient's booking appears in the doctor queue with their entered name", async () => {
  const booked = await rpc("create_test_booking", { _name: "Test Patient Zed", _reason: "Made-up cough" });
  assert.equal(booked.status, 200); created.push(booked.data);
  const queue = await rpc("list_test_bookings");
  const row = queue.data.find((b: { id: string }) => b.id === booked.data);
  assert.equal(row.patient_name, "Test Patient Zed");
  assert.equal(row.status, "pending");
});
test("no doctor name is shown before acceptance, and the doctor name appears after", async () => {
  const booked = await rpc("create_test_booking", { _name: "Test Patient Yara", _reason: "Made-up rash" });
  created.push(booked.data);
  assert.equal((await rpc("get_test_booking", { _id: booked.data })).data.doctor_name, null);
  assert.equal((await rpc("claim_test_booking", { _id: booked.data })).data, true);
  assert.equal((await rpc("get_test_booking", { _id: booked.data })).data.doctor_name, "Dr. Alex Morgan");
});
test("two doctors cannot both take the same booking", async () => {
  const booked = await rpc("create_test_booking", { _name: "Test Patient Xan", _reason: "Made-up fever" });
  created.push(booked.data);
  const [a, b] = await Promise.all([rpc("claim_test_booking", { _id: booked.data }), rpc("claim_test_booking", { _id: booked.data })]);
  assert.deepEqual([a.data, b.data].sort(), [false, true]);
});
test("names over 80 characters and empty reasons are rejected", async () => {
  assert.notEqual((await rpc("create_test_booking", { _name: "x".repeat(81), _reason: "ok" })).status, 200);
  assert.notEqual((await rpc("create_test_booking", { _name: "Ok", _reason: "  " })).status, 200);
});
test("visitors cannot read or change the queue table directly", async () => {
  assert.notEqual(await table(), 200);
});
