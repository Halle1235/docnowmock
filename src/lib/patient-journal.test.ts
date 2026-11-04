import { test } from "node:test";
import { strict as assert } from "node:assert";
import { doctorWorkspace, searchHistory } from "./doctor-workspace";
import { sampleJournal, validJournalEntry } from "./patient-journal";
let visitId = "";
let patientId = "";

test("patient journal keeps timestamped notes across visits by patient ID, not name", () => {
  doctorWorkspace.setAvailable(true);
  doctorWorkspace.addSamplePatient();
  const visits = doctorWorkspace.getSnapshot().visits;
  const visit = visits[visits.length - 1];
  visitId = visit.id; patientId = visit.patientId;
  doctorWorkspace.claim(visitId);
  assert.equal(doctorWorkspace.addJournalEntry(visitId, "Clinician diagnosis", "Clinician treatment", "Visit one notes"), true);
  const entry = sampleJournal.getSnapshot()[0];
  assert.equal(entry.patient_id, patientId);
  assert.equal(entry.consultation_id, visitId);
  assert.equal(entry.doctor_name, "Sample doctor");
  assert.equal(Number.isFinite(Date.parse(entry.created_at)), true);
  assert.equal(sampleJournal.add(patientId, "future-visit", "", "", "Visit two notes"), true);
  assert.equal(sampleJournal.getSnapshot().filter(e => e.patient_id === entry.patient_id).length, 2);
  assert.equal(sampleJournal.getSnapshot().filter(e => e.patient_id === "different-patient").length, 0);
});
test("ending a joined call marks Completed in history exactly once without discarding journal notes", () => {
  doctorWorkspace.startCall(visitId, 1000);
  doctorWorkspace.finishCall(visitId, 61000);
  doctorWorkspace.finishCall(visitId, 99000);
  const visit = searchHistory(doctorWorkspace.getSnapshot().visits, "Sample patient").find(v => v.id === visitId);
  assert.ok(visit);
  assert.equal(visit.status, "completed");
  assert.equal(visit.completedAt, 61000);
  assert.equal(visit.durationSeconds, 60);
  assert.equal(sampleJournal.getSnapshot().filter(e => e.patient_id === visit.patientId).length, 2);
  assert.equal(doctorWorkspace.addJournalEntry(visitId, "", "", "Post-call documentation"), true);
  assert.equal(doctorWorkspace.getSnapshot().visits.find(v => v.id === visitId)?.status, "completed");
  assert.equal(sampleJournal.getSnapshot()[0].notes, "Post-call documentation");
});
test("journal rejects empty or oversized clinical input and unassigned sample writers", () => {
  assert.equal(validJournalEntry("", "", " "), false);
  assert.equal(validJournalEntry("x".repeat(1001), "", "Notes"), false);
  assert.equal(validJournalEntry("", "x".repeat(4001), "Notes"), false);
  assert.equal(validJournalEntry("", "", "x".repeat(10001)), false);
  assert.equal(validJournalEntry("x".repeat(1000), "x".repeat(4000), "x".repeat(10000)), true);
  assert.equal(doctorWorkspace.addJournalEntry("outsider", "", "", "Notes"), false);
  assert.equal(doctorWorkspace.addJournalEntry("sample-2", "", "", "Unclaimed notes"), false);
});