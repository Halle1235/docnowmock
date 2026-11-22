import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type RpcResponse<T> = { data: T | null; error: PostgrestError | null };
type BookingContinuityClient = {
  rpc: <T>(name: string, args?: Record<string, unknown>) => Promise<RpcResponse<T>>;
};

// These RPCs are introduced by the source-only booking continuity migration.
// Keeping the boundary here avoids editing generated backend types before that migration is applied.
const client = supabase as unknown as BookingContinuityClient;

export async function consultationsAcceptingRequests() {
  const { data, error } = await client.rpc<boolean>("consultations_accepting_requests");
  if (error) throw error;
  if (typeof data !== "boolean") throw new Error("Availability unavailable");
  return data;
}

export async function setMyDoctorAvailability(available: boolean) {
  const { error } = await client.rpc<undefined>("set_my_doctor_availability", { _available: available });
  if (error) throw error;
}

export async function cancelMyWaitingBooking(consultationId: string) {
  const { data, error } = await client.rpc<boolean>("cancel_my_waiting_booking", {
    _consultation_id: consultationId,
  });
  if (error) throw error;
  if (typeof data !== "boolean") throw new Error("Cancellation status unavailable");
  return data;
}
