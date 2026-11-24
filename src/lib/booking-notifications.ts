import { useSyncExternalStore } from "react";
import { bookingSound } from "./booking-sound";

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
  bookingSound.play(role);
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
