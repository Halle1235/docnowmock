import { test } from "node:test";
import { strict as assert } from "node:assert";
import { patientWorkspace } from "./patient-workspace";
import { doctorWorkspace } from "./doctor-workspace";
import { sampleBooking } from "./sample-booking";

test("paid sample booking is unassigned and appears in the doctor's pending queue", () => {
  assert.equal(patientWorkspace.bookSample(), true);
  assert.equal(sampleBooking.getSnapshot(), "pending");
  assert.equal(patientWorkspace.getSnapshot().visits.find(v => v.id === "sample-1")?.doctor, "");
  assert.equal(doctorWorkspace.getSnapshot().visits.find(v => v.id === "sample-1")?.status, "pending");
  assert.equal(patientWorkspace.getSnapshot().visits.find(v => v.id === "sample-1")?.amount, 249);
});
test("only a successful matching sample claim produces acceptance", () => {
  doctorWorkspace.setAvailable(false);
  assert.equal(doctorWorkspace.claim("sample-1"), false);
  assert.equal(sampleBooking.getSnapshot(), "pending");
  sampleBooking.accept("other-booking");
  assert.equal(sampleBooking.getSnapshot(), "pending");
  doctorWorkspace.setAvailable(true);
  assert.equal(doctorWorkspace.claim("sample-1"), true);
  assert.equal(sampleBooking.getSnapshot(), "claimed");
  assert.equal(doctorWorkspace.claim("sample-1"), false);
});