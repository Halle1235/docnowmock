import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MOCK_LOGIN_ENABLED } from "./mock-login";

// Temporary no-login test queue shared across devices. Holds only a display name and visit reason,
// expires automatically, and never grants access to live consultations or patient records.
export interface TestBooking { id: string; patient_name: string; reason: string; status: "pending" | "claimed"; created_at: string }
export interface TestBookingStatus { status: "pending" | "claimed" | "completed"; doctor_name: string | null }
export const TEST_BOOKING_KEY = "testBookingId";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function testBookingInput(name: unknown, reason: unknown) {
  const n = typeof name === "string" ? name.trim() : "";
  const r = typeof reason === "string" ? reason.trim() : "";
  if (!n || n.length > 80 || !r || r.length > 300) return null;
  return { name: n, reason: r };
}
export const isTestBookingId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

export async function createTestBooking(name: string, reason: string) {
  const input = testBookingInput(name, reason);
  if (!MOCK_LOGIN_ENABLED || !input) return null;
  const { data, error } = await supabase.rpc("create_test_booking", { _name: input.name, _reason: input.reason });
  if (error || !isTestBookingId(data)) throw new Error(error?.message || "Booking failed");
  return data;
}
export async function listTestBookings(): Promise<TestBooking[]> {
  if (!MOCK_LOGIN_ENABLED) return [];
  const { data, error } = await supabase.rpc("list_test_bookings");
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as TestBooking[]).filter(b => isTestBookingId(b?.id)) : [];
}
export async function getTestBooking(id: string): Promise<TestBookingStatus | null> {
  if (!MOCK_LOGIN_ENABLED || !isTestBookingId(id)) return null;
  const { data, error } = await supabase.rpc("get_test_booking", { _id: id });
  if (error) throw error;
  return (data as unknown as TestBookingStatus) ?? null;
}
export async function claimTestBooking(id: string) {
  if (!MOCK_LOGIN_ENABLED || !isTestBookingId(id)) return false;
  const { data, error } = await supabase.rpc("claim_test_booking", { _id: id });
  if (error) throw error;
  return data === true;
}
export async function completeTestBooking(id: string) {
  if (!MOCK_LOGIN_ENABLED || !isTestBookingId(id)) return false;
  const { data } = await supabase.rpc("complete_test_booking", { _id: id });
  return data === true;
}

/** Polls the patient's own shared test booking (id kept in this tab's session) for acceptance. */
export function useOwnTestBooking() {
  const [id] = useState(() => { const v = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(TEST_BOOKING_KEY) : null; return MOCK_LOGIN_ENABLED && isTestBookingId(v) ? v : null; });
  const [status, setStatus] = useState<TestBookingStatus | null>(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = () => getTestBooking(id).then(b => { if (active) setStatus(b); }, () => {});
    void load(); const t = setInterval(load, 4000);
    return () => { active = false; clearInterval(t); };
  }, [id]);
  return { id, status };
}
