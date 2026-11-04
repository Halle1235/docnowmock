import { useEffect, useRef } from "react";
import { bookingChanges, listenForSampleBookingAlerts, notifyBooking, type NotificationRole } from "@/lib/booking-notifications";

export function useBookingNotifications(role: NotificationRole, records: { id: string; status: string }[], ready = true, sample = false) {
  const previous = useRef<{ id: string; status: string }[] | null>(null);
  useEffect(() => { if (sample) listenForSampleBookingAlerts(); }, [sample]);
  useEffect(() => {
    if (!ready) return;
    const changes = bookingChanges(role, previous.current, records);
    for (const visit of changes) {
      notifyBooking(role, `${sample ? "sample" : "live"}:${role === "doctor" ? "arrival" : "accepted"}:${visit.id}`,
        role === "doctor" ? "A patient is waiting in your queue." : "Your booking has been accepted. Your doctor will start the call shortly.");
    }
    previous.current = records.map(v => ({ id: v.id, status: v.status }));
  }, [records, ready, role, sample]);
}