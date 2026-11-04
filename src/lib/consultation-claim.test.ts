import { test } from "node:test";
import { strict as assert } from "node:assert";
import { doctorWorkspace, searchHistory } from "./doctor-workspace";
import { sampleJournal } from "./patient-journal";
import { SAMPLE_PATIENTS } from "./sample-patients";

test("three distinct sample patients have name-searchable history and separate journals", () => {
  assert.equal(SAMPLE_PATIENTS.length, 3);
  assert.equal(new Set(SAMPLE_PATIENTS.map(p => p.id)).size, 3);
  for (const patient of SAMPLE_PATIENTS) {
    const history = searchHistory(doctorWorkspace.getSnapshot().visits, patient.name.toLowerCase());
    assert.equal(history.length >= 1, true);
    assert.equal(history.every(v => v.patientId === patient.id), true);
    assert.equal(sampleJournal.getSnapshot().some(e => e.patient_id === patient.id && e.consultation_id === `${patient.visitId}-past`), true);
  }
});
test("two simultaneous sample claim attempts cannot both claim one booking", async () => {
  doctorWorkspace.setAvailable(true);
  doctorWorkspace.addSamplePatient();
  const visits = doctorWorkspace.getSnapshot().visits;
  const id = visits[visits.length - 1].id;
  const attempts = await Promise.all([Promise.resolve().then(() => doctorWorkspace.claim(id)), Promise.resolve().then(() => doctorWorkspace.claim(id))]);
  assert.deepEqual(attempts, [true, false]);
  assert.equal(doctorWorkspace.getSnapshot().visits.find(v => v.id === id)?.status, "claimed");
});