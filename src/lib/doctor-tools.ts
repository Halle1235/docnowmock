// Shared helpers for the doctor dashboard and call notes.

/** Patients waiting longer than this are highlighted. */
export const LONG_WAIT_MINUTES = 5;

export function minutesWaiting(createdAt: string, now: number = Date.now()) {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

export function isLongWait(createdAt: string, now: number = Date.now()) {
  return minutesWaiting(createdAt, now) >= LONG_WAIT_MINUTES;
}

export interface StatsInput {
  status: string;
  claimed_at?: string | null;
  completed_at?: string | null;
}

/** Consultations completed today and their average length in minutes (null when none). */
export function dailyStats(items: StatsInput[], now: Date = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = items.filter(
    (c) => c.status === "completed" && c.completed_at && new Date(c.completed_at) >= start && new Date(c.completed_at) <= now,
  );
  const lengths = today
    .filter((c) => c.claimed_at)
    .map((c) => (new Date(c.completed_at!).getTime() - new Date(c.claimed_at!).getTime()) / 60000)
    .filter((m) => m >= 0);
  const avg = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null;
  return { completedToday: today.length, averageMinutes: avg };
}

/** Common non-controlled medicines with starting doses. Doctors adjust before saving. */
export const COMMON_MEDICINES = [
  { name: "Paracetamol 500 mg", dose: "1–2 tablets every 6 hours as needed, max 8 per day" },
  { name: "Ibuprofen 400 mg", dose: "1 tablet every 8 hours with food, for up to 5 days" },
  { name: "Amoxicillin 500 mg", dose: "1 capsule every 8 hours for 7 days" },
  { name: "Cetirizine 10 mg", dose: "1 tablet once daily" },
  { name: "Loratadine 10 mg", dose: "1 tablet once daily" },
  { name: "Omeprazole 20 mg", dose: "1 capsule once daily before breakfast" },
  { name: "Oral rehydration salts", dose: "1 sachet in 200 ml water after each loose stool" },
  { name: "Saline nasal spray", dose: "2 sprays in each nostril 3 times daily" },
];

export function matchesSearch(
  c: { reason_description?: string | null; reason_category?: string | null; notes?: string | null; prescription?: string | null; patientName?: string | null },
  q: string,
) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [c.patientName, c.reason_category, c.reason_description, c.notes, c.prescription]
    .some((v) => (v ?? "").toLowerCase().includes(s));
}

/** Short beep for a new patient. Browsers only allow sound after the page has been clicked. */
export function playNewPatientSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    /* sound is optional */
  }
}
