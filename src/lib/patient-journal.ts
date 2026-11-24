export interface JournalEntry {
  id: string; patient_id: string; consultation_id: string; doctor_id: string;
  doctor_name: string; license_number: string; created_at: string;
  diagnosis: string; treatment: string; notes: string;
}
export function validJournalEntry(diagnosis: string, treatment: string, notes: string) {
  return diagnosis.length <= 1000 && treatment.length <= 4000 && notes.length <= 10000 && notes.trim().length > 0;
}
