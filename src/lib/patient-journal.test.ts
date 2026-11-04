import { test } from "node:test";
import { strict as assert } from "node:assert";
import { doctorWorkspace, searchHistory } from "./doctor-workspace";
import { sampleJournal, validJournalEntry } from "./patient-journal";

test("patient journal keeps timestamped notes across visits by patient ID, not name", () => {
  doctorWorkspace.setAvailable(true);
  doctorWorkspace.claim("sample-1");
  assert.equal(doctorWorkspace.addJournalEntry("sample-1", "Clinician diagnosis", "Clinician treatment", "Visit one notes"), true);
  const entry = sampleJournal.getSnapshot()[0];
  assert.equal(entry.patient_id, "sample-patient");
  assert.equal(entry.consultation_id, "sample-1");
  assert.equal(entry.doctor_name, "Sample doctor");
  assert.equal(Number.isFinite(Date.parse(entry.created_at)), true);
  assert.equal(sampleJournal.add("sample-patient", "future-visit", "", "", "Visit two notes"), true);
  assert.equal(sampleJournal.getSnapshot().filter(e => e.patient_id === entry.patient_id).length, 2);
  assert.equal(sampleJournal.getSnapshot().filter(e => e.patient_id === "different-patient").length, 0);
});
test("ending a joined call marks Completed in history exactly once without discarding journal notes", () => {
  doctorWorkspace.startCall("sample-1", 1000);
  doctorWorkspace.finishCall("sample-1", 61000);
  doctorWorkspace.finishCall("sample-1", 99000);
  const visit = searchHistory(doctorWorkspace.getSnapshot().visits, "Sample patient")[0];
  assert.equal(visit.status, "completed");
  assert.equal(visit.completedAt, 61000);
  assert.equal(visit.durationSeconds, 60);
  assert.equal(sampleJournal.getSnapshot().filter(e => e.patient_id === visit.patientId).length, 2);
  assert.equal(doctorWorkspace.addJournalEntry("sample-1", "", "", "Alter ended visit"), false);
});
test("journal rejects empty or oversized clinical input and unassigned sample writers", () => {
  assert.equal(validJournalEntry("", "", " "), false);
  assert.equal(validJournalEntry("x".repeat(1001), "", "Notes"), false);
  assert.equal(validJournalEntry("", "x".repeat(4001), "Notes"), false);
  assert.equal(validJournalEntry("", "", "x".repeat(10001)), false);
  assert.equal(validJournalEntry("x".repeat(1000), "x".repeat(4000), "x".repeat(10000)), true);
  assert.equal(doctorWorkspace.addJournalEntry("outsider", "", "", "Notes"), false);
});