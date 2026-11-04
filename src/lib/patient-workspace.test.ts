/// <reference types="node" />
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { patientWorkspace, validHealthProfile, validRating, validFollowUp } from "./patient-workspace";
import { validCallFileMetadata, validCallFileContent, MAX_CALL_FILE_BYTES } from "./call-sharing";
test("health profile fields are bounded and all three are retained", () => {
  assert.equal(validHealthProfile({ allergies: "x".repeat(2001), medicines: "", conditions: "" }), false);
  assert.equal(patientWorkspace.saveProfile({ allergies: "Sample allergy", medicines: "Sample medicine", conditions: "Sample condition" }), true);
  assert.equal(patientWorkspace.getSnapshot().profile.conditions, "Sample condition");
});
test("only completed visits accept ratings from one to five", () => {
  assert.equal(patientWorkspace.rate("sample-1", 5, ""), false);
  assert.equal(validRating(6, ""), false); assert.equal(validRating(1.5, ""), false);
  assert.equal(patientWorkspace.rate("sample-past", 4, "Good sample visit"), true);
  assert.equal(patientWorkspace.getSnapshot().visits.find(v => v.id === "sample-past")?.rating, 4);
});
test("follow-up dates reject past or invalid calendar dates", () => {
  assert.equal(validFollowUp("2026-02-30", "Check-up", new Date("2026-01-01")), false);
  assert.equal(validFollowUp("2026-01-01", "Check-up", new Date("2026-02-01")), false);
  assert.equal(validFollowUp("2026-02-02", "Check-up", new Date("2026-02-01")), true);
});
test("paid follow-up cannot be booked during an active visit", () => {
  assert.equal(patientWorkspace.payAndRebook("sample-past", true), false);
  patientWorkspace.complete("sample-1");
});
test("doctor suggestion does not book without patient agreement and payment", () => {
  assert.equal(patientWorkspace.payAndRebook("sample-past", false), false);
  assert.equal(patientWorkspace.rebook("sample-past"), false);
});
test("follow-up uses the current AED 249 consultation price after simulated payment", () => {
  assert.equal(patientWorkspace.payAndRebook("sample-past", true), true);
  assert.equal(patientWorkspace.getSnapshot().visits.at(-1)?.amount, 249);
});
test("a paid follow-up cannot be booked twice", () => {
  assert.equal(patientWorkspace.payAndRebook("sample-past", true), false);
});
test("file sharing rejects unsafe types, paths, and over-limit files", () => {
  assert.equal(validCallFileMetadata("lab.pdf", "application/pdf", MAX_CALL_FILE_BYTES), true);
  assert.equal(validCallFileMetadata("lab.pdf", "application/pdf", MAX_CALL_FILE_BYTES + 1), false);
  assert.equal(validCallFileMetadata("rash.svg", "image/svg+xml", 200), false);
  assert.equal(validCallFileMetadata("../lab.pdf", "application/pdf", 200), false);
});
test("file sharing validates content rather than trusting a filename", async () => {
  assert.equal(await validCallFileContent(new Blob(["<script>alert(1)</script>"], { type: "application/pdf" })), false);
  assert.equal(await validCallFileContent(new Blob(["%PDF-1.7 sample"], { type: "application/pdf" })), true);
});