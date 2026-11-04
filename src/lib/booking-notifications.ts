import { useSyncExternalStore } from "react";
import { MOCK_LOGIN_ENABLED } from "./mock-login";

export type NotificationRole = "doctor" | "patient";
export interface BookingNotification { id: string; message: string; createdAt: number; read: boolean }
type BookingState = { id: string; status: string };
const notifications: Record<NotificationRole, BookingNotification[]> = { doctor: [], patient: [] };
const listeners = new Set<() => void>();
const delivered = new Set<string>();
export function notifyBooking(role: NotificationRole, key: string, message: string) {
  const unique = `${role}:${key}`;
  if (delivered.has(unique)) return;
  delivered.add(unique);
  notifications[role] = [{ id: unique, message, createdAt: Date.now(), read: false }, ...notifications[role]].slice(0, 50);
  listeners.forEach(fn => fn());
}
export function bookingChanges(role: NotificationRole, previous: BookingState[] | null, current: BookingState[]) {
  const before = new Map(previous?.map(v => [v.id, v.status]));
  return current.filter(v => role === "doctor"
    ? v.status === "pending" && !before.has(v.id)
    : ["claimed", "in_progress"].includes(v.status) && (!before.has(v.id) || before.get(v.id) === "pending"));
}
export const bookingNotifications = {
  markRead(role: NotificationRole) {
    notifications[role] = notifications[role].map(n => ({ ...n, read: true }));
    listeners.forEach(fn => fn());
  },
  getSnapshot: (role: NotificationRole) => notifications[role],
};
export function useBookingNotificationList(role: NotificationRole) {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => notifications[role], () => notifications[role]);
}

// Account-free sample signals contain no names, symptoms, notes, or credentials.
// They only produce presentation alerts, never access or assignment decisions.
let channel: BroadcastChannel | null = null;
function sampleChannel() {
  if (!MOCK_LOGIN_ENABLED || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel("docnow-sample-booking-alerts");
    channel.onmessage = event => {
      const value: unknown = event.data;
      if (!value || typeof value !== "object" || !("kind" in value) || !("id" in value)) return;
      if (value.kind !== "accepted" || typeof value.id !== "string" || value.id !== "sample-1") return;
      notifyBooking("patient", `accepted:${value.id}`, "Your sample booking has been accepted. Your doctor will start the call shortly.");
    };
  }
  return channel;
}
export function listenForSampleBookingAlerts() { sampleChannel(); }
export function notifySampleAcceptance(id: string) {
  if (!MOCK_LOGIN_ENABLED || id !== "sample-1") return;
  notifyBooking("patient", `accepted:${id}`, "Your sample booking has been accepted. Your doctor will start the call shortly.");
  sampleChannel()?.postMessage({ kind: "accepted", id });
}