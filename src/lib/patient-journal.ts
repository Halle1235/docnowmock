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
}));
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