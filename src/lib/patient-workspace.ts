import { useSyncExternalStore } from "react";
import { MOCK_LOGIN_ENABLED } from "./mock-login";
import { type PrescriptionDraft, validPrescription } from "./doctor-workspace";

export interface HealthProfile { allergies: string; medicines: string; conditions: string }
export interface PatientVisit {
  id: string; reason: string; doctor: string; createdAt: number;
  status: "waiting" | "completed"; prescriptions: PrescriptionDraft[];
  followUpDate?: string; followUpReason?: string; rebooked?: boolean;
  rating?: number; comment?: string; amount: number;
}
export const SAMPLE_VISIT_PRICE = 249;
export function validHealthProfile(profile: HealthProfile) {
  return [profile.allergies, profile.medicines, profile.conditions].every(value => typeof value === "string" && value.length <= 2000);
}
export function validRating(rating: number, comment: string) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 && comment.length <= 1000;
}
export function validFollowUp(date: string, reason: string, now = new Date()) {
  const parsed = new Date(`${date}T12:00:00`);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && parsed >= today && reason.trim().length > 0 && reason.length <= 500;
}
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 2);
let snapshot = {
  profile: { allergies: "Penicillin (sample)", medicines: "None reported (sample)", conditions: "None reported (sample)" } as HealthProfile,
  visits: [
    { id: "sample-1", reason: "Sore throat", doctor: "Dr. Alex Morgan", createdAt: Date.now() - 7 * 60000, status: "waiting", prescriptions: [], amount: SAMPLE_VISIT_PRICE },
    { id: "sample-past", reason: "General consultation", doctor: "Dr. Alex Morgan", createdAt: Date.now() - 86400000, status: "completed", prescriptions: [], amount: SAMPLE_VISIT_PRICE, followUpDate: tomorrow.toISOString().slice(0, 10), followUpReason: "Sample check-up suggested by the doctor" },
  ] as PatientVisit[],
};
const listeners = new Set<() => void>();
function emit(next: typeof snapshot) { if (!MOCK_LOGIN_ENABLED) return; snapshot = next; listeners.forEach(fn => fn()); }
export const patientWorkspace = {
  getSnapshot: () => snapshot,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  saveProfile: (profile: HealthProfile) => { if (!MOCK_LOGIN_ENABLED || !validHealthProfile(profile)) return false; emit({ ...snapshot, profile: { ...profile } }); return true; },
  rate: (id: string, rating: number, comment: string) => {
    if (!MOCK_LOGIN_ENABLED || !validRating(rating, comment) || !snapshot.visits.some(v => v.id === id && v.status === "completed")) return false;
    emit({ ...snapshot, visits: snapshot.visits.map(v => v.id === id ? { ...v, rating, comment: comment.trim() } : v) }); return true;
  },
  complete: (id: string, prescriptions: PrescriptionDraft[] = [], followUpDate?: string, followUpReason?: string) => {
    if (prescriptions.length > 20 || !prescriptions.every(validPrescription)) return false;
    const followUp = followUpDate && followUpReason && validFollowUp(followUpDate, followUpReason) ? { followUpDate, followUpReason } : {};
    emit({ ...snapshot, visits: snapshot.visits.map(v => v.id === id ? { ...v, status: "completed", prescriptions: prescriptions.map(p => ({ ...p })), ...followUp } : v) }); return true;
  },
  rebook: (id: string) => {
    const visit = snapshot.visits.find(v => v.id === id);
    if (!MOCK_LOGIN_ENABLED || !visit || visit.status !== "completed" || !visit.followUpDate || visit.rebooked || snapshot.visits.some(v => v.status === "waiting")) return false;
    return false; // Booking is only created through the agreed payment flow below.
  },
  payAndRebook: (id: string, patientAgreed: boolean) => {
    const visit = snapshot.visits.find(v => v.id === id);
    if (!MOCK_LOGIN_ENABLED || !patientAgreed || !visit || visit.status !== "completed" || !visit.followUpDate || !visit.followUpReason || visit.rebooked || snapshot.visits.some(v => v.status === "waiting")) return false;
    const next: PatientVisit = { id: `sample-followup-${crypto.randomUUID()}`, reason: `Follow-up: ${visit.reason}`, doctor: visit.doctor, createdAt: Date.now(), status: "waiting", prescriptions: [], amount: SAMPLE_VISIT_PRICE };
    emit({ ...snapshot, visits: [...snapshot.visits.map(v => v.id === id ? { ...v, rebooked: true } : v), next] }); return true;
  },
};
export function usePatientWorkspace() { return useSyncExternalStore(patientWorkspace.subscribe, patientWorkspace.getSnapshot, patientWorkspace.getSnapshot); }