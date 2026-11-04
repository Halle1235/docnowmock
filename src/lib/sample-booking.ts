import { useSyncExternalStore } from "react";
import { MOCK_LOGIN_ENABLED } from "./mock-login";

// Presentation-only handshake: never contains user input or grants room access.
export type SampleBookingStatus = "pending" | "claimed";
let status: SampleBookingStatus = "pending";
let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();
function apply(next: SampleBookingStatus) { status = next; listeners.forEach(fn => fn()); }
function connect() {
  if (!MOCK_LOGIN_ENABLED || typeof window === "undefined" || typeof BroadcastChannel === "undefined" || channel) return;
  channel = new BroadcastChannel("docnow-fictional-booking-state");
  channel.onmessage = event => {
    const value: unknown = event.data;
    if (!value || typeof value !== "object" || !("id" in value) || value.id !== "sample-1" || !("kind" in value)) return;
    if (value.kind === "request") channel?.postMessage({ id: "sample-1", kind: "state", status });
    else if ((value.kind === "state" || value.kind === "booked" || value.kind === "accepted") && "status" in value && (value.status === "pending" || value.status === "claimed")) {
      // A pending peer must not overwrite an acceptance already observed here.
      if (value.kind !== "state" || status !== "claimed") apply(value.status);
    }
  };
  channel.postMessage({ id: "sample-1", kind: "request" });
}
export const sampleBooking = {
  getSnapshot: () => status,
  subscribe: (fn: () => void) => { connect(); listeners.add(fn); return () => { listeners.delete(fn); }; },
  book() { if (!MOCK_LOGIN_ENABLED) return; connect(); apply("pending"); channel?.postMessage({ id: "sample-1", kind: "booked", status: "pending" }); },
  accept(id: string) { if (!MOCK_LOGIN_ENABLED || id !== "sample-1") return; connect(); apply("claimed"); channel?.postMessage({ id: "sample-1", kind: "accepted", status: "claimed" }); },
};
export function useSampleBooking() { return useSyncExternalStore(sampleBooking.subscribe, sampleBooking.getSnapshot, sampleBooking.getSnapshot); }