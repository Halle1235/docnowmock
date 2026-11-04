import { test } from "node:test";
import { strict as assert } from "node:assert";
import { bookingChanges, bookingNotifications, notifyBooking, notifySampleAcceptance } from "./booking-notifications";
import { doctorWorkspace } from "./doctor-workspace";
import { sampleJournal } from "./patient-journal";

test("doctor notifications identify new pending bookings but not repeats or assigned visits", () => {
  const before = [{ id: "existing", status: "pending" }];
  assert.deepEqual(bookingChanges("doctor", before, [...before, { id: "new", status: "pending" }, { id: "assigned", status: "claimed" }]).map(v => v.id), ["new"]);
  assert.deepEqual(bookingChanges("doctor", before, before), []);
});
test("patient acceptance alerts occur on acceptance, not on call progress or completion", () => {
  assert.equal(bookingChanges("patient", [{ id: "a", status: "pending" }], [{ id: "a", status: "claimed" }]).length, 1);
  assert.equal(bookingChanges("patient", [{ id: "a", status: "claimed" }], [{ id: "a", status: "in_progress" }]).length, 0);
  assert.equal(bookingChanges("patient", [{ id: "a", status: "pending" }], [{ id: "a", status: "completed" }]).length, 0);
});
test("successful sample claim notifies the matching patient once; failed claims do not", () => {
  doctorWorkspace.setAvailable(false);
  assert.equal(doctorWorkspace.claim("sample-1"), false);
  assert.equal(bookingNotifications.getSnapshot("patient").length, 0);
  doctorWorkspace.setAvailable(true);
  assert.equal(doctorWorkspace.claim("sample-1"), true);
  assert.equal(doctorWorkspace.claim("sample-1"), false);
  assert.equal(bookingNotifications.getSnapshot("patient").length, 1);
  notifySampleAcceptance("sample-2");
  assert.equal(bookingNotifications.getSnapshot("patient").length, 1);
});
test("notifications deduplicate and can be marked read", () => {
  notifyBooking("doctor", "arrival:a", "Waiting");
  notifyBooking("doctor", "arrival:a", "Waiting");
  assert.equal(bookingNotifications.getSnapshot("doctor").length, 1);
  bookingNotifications.markRead("doctor");
  assert.equal(bookingNotifications.getSnapshot("doctor")[0].read, true);
});
test("Amina's fictional journal spans September 4 to November 4, two calendar months", () => {
  const entries = sampleJournal.getSnapshot().filter(e => e.patient_id === "sample-patient");
  assert.equal(entries.length, 6);
  assert.equal(entries.at(-1)?.created_at.slice(0, 10), "2026-09-04");
  assert.equal(entries[0].created_at.slice(0, 10), "2026-11-04");
  assert.equal(entries.every(e => e.license_number === "Sample · Not verified"), true);
});