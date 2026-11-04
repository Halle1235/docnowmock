import { useSyncExternalStore } from "react";
import { MOCK_LOGIN_ENABLED } from "./mock-login";
import { SAMPLE_PATIENTS } from "./sample-patients";

export interface JournalEntry {
  id: string; patient_id: string; consultation_id: string; doctor_id: string;
  doctor_name: string; license_number: string; created_at: string;
  diagnosis: string; treatment: string; notes: string;
}
export function validJournalEntry(diagnosis: string, treatment: string, notes: string) {
  return diagnosis.length <= 1000 && treatment.length <= 4000 && notes.length <= 10000 && notes.trim().length > 0;
}
let entries: JournalEntry[] = SAMPLE_PATIENTS.map((patient, index) => ({
  id: `sample-journal-${index + 1}`, patient_id: patient.id, consultation_id: `${patient.visitId}-past`,
  doctor_id: "sample-doctor", doctor_name: "Sample doctor", license_number: "Sample · Not verified",
  created_at: `2026-10-${24 - index}T09:00:00.000Z`, diagnosis: patient.reason, treatment: "", notes: patient.notes,
})).concat([
  { id: "sample-amina-september-04", patient_id: "sample-patient", consultation_id: "sample-1-september-04", doctor_id: "sample-doctor-2", doctor_name: "Dr. Sara Ahmed (fictional)", license_number: "Sample · Not verified", created_at: "2026-09-04T10:15:00.000Z", diagnosis: "Fictional visit: seasonal nasal symptoms", treatment: "Sample discussion of symptom tracking; no prescription issued.", notes: "Fictional patient described intermittent sneezing after dust exposure over the previous week. No fever or breathing difficulty reported in this example. Allergy history reviewed; sample penicillin allergy retained. A symptom diary and a future review were discussed." },
  { id: "sample-amina-september-18", patient_id: "sample-patient", consultation_id: "sample-1-september-18", doctor_id: "sample-doctor-2", doctor_name: "Dr. Sara Ahmed (fictional)", license_number: "Sample · Not verified", created_at: "2026-09-18T11:30:00.000Z", diagnosis: "Fictional follow-up: nasal symptoms improved", treatment: "Sample follow-up discussion; no medicine recorded.", notes: "Fictional follow-up reviewed the symptom diary. Sneezing was less frequent and no new symptoms were reported. The patient reported normal sleep and usual daily activities. Existing allergy information was confirmed without changes." },
  { id: "sample-amina-october-07", patient_id: "sample-patient", consultation_id: "sample-1-october-07", doctor_id: "sample-doctor-3", doctor_name: "Dr. Karim Mansour (fictional)", license_number: "Sample · Not verified", created_at: "2026-10-07T09:45:00.000Z", diagnosis: "Fictional visit: intermittent headache", treatment: "Sample review of symptom timing and follow-up; no prescription issued.", notes: "Fictional patient reported two brief headaches during a busy work week. This example records no reported visual change, injury, or fever. Sleep, meal timing, and current medicines were reviewed. A follow-up conversation was agreed if symptoms continued." },
  { id: "sample-amina-october-16", patient_id: "sample-patient", consultation_id: "sample-1-october-16", doctor_id: "sample-doctor-3", doctor_name: "Dr. Karim Mansour (fictional)", license_number: "Sample · Not verified", created_at: "2026-10-16T14:00:00.000Z", diagnosis: "Fictional follow-up: headache resolved", treatment: "Sample progress review; no treatment or prescription issued.", notes: "Fictional patient reported no further headaches since the prior visit. No new medicines or allergies were reported. Previous journal entries were reviewed for continuity. No additional follow-up booking was created in this sample." },
  { id: "sample-amina-november-04", patient_id: "sample-patient", consultation_id: "sample-1-november-04", doctor_id: "sample-doctor", doctor_name: "Sample doctor", license_number: "Sample · Not verified", created_at: "2026-11-04T03:00:00.000Z", diagnosis: "Fictional history review before current visit", treatment: "Record review only; no prescription issued.", notes: "Fictional two-month timeline reviewed before the current sore-throat consultation. Prior nasal symptoms and headaches had resolved in the example. Penicillin allergy remains on the sample profile. Current symptoms require a new assessment; historical entries are not treatment recommendations." },
]).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
const listeners = new Set<() => void>();
export const sampleJournal = {
  getSnapshot: () => entries,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  add: (patientId: string, consultationId: string, diagnosis: string, treatment: string, notes: string) => {
    if (!MOCK_LOGIN_ENABLED || !patientId || !consultationId || !validJournalEntry(diagnosis, treatment, notes)) return false;
    entries = [{ id: crypto.randomUUID(), patient_id: patientId, consultation_id: consultationId, doctor_id: "sample-doctor", doctor_name: "Sample doctor", license_number: "Sample · Not verified", created_at: new Date().toISOString(), diagnosis: diagnosis.trim(), treatment: treatment.trim(), notes: notes.trim() }, ...entries];
    listeners.forEach(fn => fn()); return true;
  },
};
export function useSampleJournal() { return useSyncExternalStore(sampleJournal.subscribe, sampleJournal.getSnapshot, sampleJournal.getSnapshot); }