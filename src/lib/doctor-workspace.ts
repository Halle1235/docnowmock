import { useSyncExternalStore } from "react";
import { MOCK_LOGIN_ENABLED } from "./mock-login";
import { sampleJournal } from "./patient-journal";
import { SAMPLE_PATIENTS } from "./sample-patients";
import { notifySampleAcceptance } from "./booking-notifications";
import { sampleBooking } from "./sample-booking";
import { completeTestBooking, type TestBooking } from "./test-bookings";

export interface PrescriptionDraft {
  medicine: string;
  dose: string;
  frequency: string;
  duration: string;
}
export interface DoctorVisit {
  id: string;
  patientId: string;
  name: string;
  dateOfBirth: string;
  allergies: string;
  reason: string;
  symptoms: string;
  createdAt: number;
  status: "pending" | "claimed" | "in_progress" | "completed";
  notes: string;
  prescriptions: PrescriptionDraft[];
  startedAt?: number;
  completedAt?: number;
  durationSeconds?: number;
  followUpDate?: string;
  followUpReason?: string;
  testBooking?: boolean;
}
export const WAIT_ALERT_MINUTES = 5;
export const MEDICINE_OPTIONS = ["Paracetamol", "Ibuprofen", "Cetirizine", "Oral rehydration salts"];

export function patientAge(dateOfBirth: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (!Number.isFinite(birth.getTime()) || birth > now || birth.toISOString().slice(0, 10) !== dateOfBirth) return null;
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}
export function waitMinutes(visit: Pick<DoctorVisit, "createdAt">, now = Date.now()) {
  return Math.max(0, Math.floor((now - visit.createdAt) / 60000));
}
export function isLongWait(visit: Pick<DoctorVisit, "createdAt">, now = Date.now()) {
  return now - visit.createdAt >= WAIT_ALERT_MINUTES * 60000;
}
export function dailyStats(visits: DoctorVisit[], now = new Date()) {
  const today = visits.filter(v => v.status === "completed" && v.completedAt !== undefined && new Date(v.completedAt).toDateString() === now.toDateString());
  const timed = today.filter(v => v.durationSeconds !== undefined);
  return { completed: today.length, averageSeconds: timed.length ? Math.round(timed.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0) / timed.length) : null };
}
export function searchHistory(visits: DoctorVisit[], search: string) {
  const query = search.trim().toLocaleLowerCase();
  return visits.filter(v => v.status === "completed" && [v.name, v.reason, v.symptoms, v.notes, ...v.prescriptions.map(p => `${p.medicine} ${p.dose} ${p.frequency} ${p.duration}`)].join(" ").toLocaleLowerCase().includes(query)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}
export function validPrescription(p: PrescriptionDraft) {
  return [p.medicine, p.dose, p.frequency, p.duration].every(v => v.trim().length > 0 && v.length <= 200);
}

function sampleVisit(id: string, createdAt: number): DoctorVisit {
  return { id, patientId: id === "sample-1" ? "sample-patient" : `patient-${id}`, name: "Sample patient", dateOfBirth: "1992-04-18", allergies: "Penicillin (sample)", reason: "Sore throat", symptoms: "Sore throat for two days; no reported fever (sample)", createdAt, status: "pending", notes: "", prescriptions: [] };
}
const initialVisits: DoctorVisit[] = SAMPLE_PATIENTS.flatMap((patient, index) => {
  const current = { ...sampleVisit(patient.visitId, Date.now() - (7 - index * 2) * 60000), patientId: patient.id, name: patient.name, dateOfBirth: patient.dateOfBirth, reason: patient.reason, allergies: patient.allergies };
  const completedAt = Date.parse(`2026-10-${24 - index}T09:00:00.000Z`);
  return [current, { ...current, id: `${patient.visitId}-past`, status: "completed" as const, createdAt: completedAt - 600000, startedAt: completedAt - 600000, completedAt, durationSeconds: 600, notes: patient.notes }];
});
let snapshot = { available: false, sound: false, visits: initialVisits };
const listeners = new Set<() => void>();
function emit(next: typeof snapshot) {
  if (!MOCK_LOGIN_ENABLED) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}
function updateVisit(id: string, change: (v: DoctorVisit) => DoctorVisit) {
  emit({ ...snapshot, visits: snapshot.visits.map(v => v.id === id ? change(v) : v) });
}
export const doctorWorkspace = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  setAvailable: (available: boolean) => emit({ ...snapshot, available }),
  setSound: (sound: boolean) => emit({ ...snapshot, sound }),
  addSamplePatient: () => {
    if (!snapshot.available) return;
    emit({ ...snapshot, visits: [...snapshot.visits, { ...sampleVisit(crypto.randomUUID(), Date.now()), name: `Sample patient ${snapshot.visits.length + 1}`, reason: "Seasonal allergies", allergies: "Not reported", symptoms: "Sneezing and itchy eyes (sample)" }] });
  },
  claim: (id: string) => {
    if (!MOCK_LOGIN_ENABLED || !snapshot.available || !snapshot.visits.some(v => v.id === id && v.status === "pending" && !v.testBooking)) return false;
    updateVisit(id, v => v.status === "pending" ? { ...v, status: "claimed" } : v);
    notifySampleAcceptance(id);
    sampleBooking.accept(id);
    return true;
  },
  saveDraft: (id: string, notes: string, prescriptions: PrescriptionDraft[]) => {
    if (notes.length > 10000 || prescriptions.length > 20 || !prescriptions.every(validPrescription)) return false;
    const visit = snapshot.visits.find(v => v.id === id);
    if (!MOCK_LOGIN_ENABLED || !visit || visit.status === "pending" || visit.status === "completed") return false;
    updateVisit(id, v => ({ ...v, notes, prescriptions: prescriptions.map(p => ({ ...p })) }));
    return true;
  },
  addJournalEntry: (id: string, diagnosis: string, treatment: string, notes: string) => {
    const visit = snapshot.visits.find(v => v.id === id);
    if (!visit || !["claimed", "in_progress"].includes(visit.status)) return false;
    return sampleJournal.add(visit.patientId, visit.id, diagnosis, treatment, notes);
  },
  startCall: (id: string, now = Date.now()) => updateVisit(id, v => v.status === "claimed" ? { ...v, status: "in_progress", startedAt: now } : v),
  saveFollowUp: (id: string, date: string, reason: string) => {
    const parsed = new Date(`${date}T12:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const visit = snapshot.visits.find(v => v.id === id);
    if (!visit || !["claimed", "in_progress"].includes(visit.status) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || parsed < today || !reason.trim() || reason.length > 500) return false;
    updateVisit(id, v => ({ ...v, followUpDate: date, followUpReason: reason.trim() })); return true;
  },
  // Merge the shared no-login test queue; a booking taken elsewhere disappears from this queue.
  syncTestBookings: (rows: TestBooking[]) => {
    const remote = new Map(rows.map(r => [r.id, r]));
    const kept = snapshot.visits.filter(v => !v.testBooking || v.status !== "pending" || remote.get(v.id)?.status === "pending");
    const known = new Set(kept.map(v => v.id));
    const added = rows.filter(r => r.status === "pending" && !known.has(r.id)).map(r => ({ ...sampleVisit(r.id, Date.parse(r.created_at) || Date.now()), patientId: `test-${r.id}`, name: r.patient_name, reason: r.reason, symptoms: r.reason, dateOfBirth: "", allergies: "Not provided (test booking)", testBooking: true }));
    if (added.length || kept.length !== snapshot.visits.length) emit({ ...snapshot, visits: [...kept, ...added] });
  },
  markTestClaimed: (id: string) => {
    if (!snapshot.available || !snapshot.visits.some(v => v.id === id && v.testBooking && v.status === "pending")) return false;
    updateVisit(id, v => ({ ...v, status: "claimed" })); return true;
  },
  finishCall: (id: string, now = Date.now()) => {
    if (snapshot.visits.some(v => v.id === id && v.testBooking && v.status === "in_progress")) void completeTestBooking(id);
    finishVisit(id, now);
  },
};
function finishVisit(id: string, now: number) {
  updateVisit(id, v => v.status === "in_progress" && v.startedAt !== undefined ? { ...v, status: "completed", completedAt: now, durationSeconds: Math.max(0, Math.round((now - v.startedAt) / 1000)) } : v);
}
sampleBooking.subscribe(() => {
  // Synchronize only the fixed fictional booking's presentation, never live records.
  const next = sampleBooking.getSnapshot();
  const visit = snapshot.visits.find(v => v.id === "sample-1");
  if (!visit || visit.status === next || (next === "claimed" && visit.status !== "pending")) return;
  updateVisit("sample-1", v => ({ ...v, status: next, ...(next === "pending" ? { createdAt: Date.now(), startedAt: undefined, completedAt: undefined, notes: "", prescriptions: [] } : {}) }));
});
export function useDoctorWorkspace() {
  return useSyncExternalStore(doctorWorkspace.subscribe, doctorWorkspace.getSnapshot, doctorWorkspace.getSnapshot);
}