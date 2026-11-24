import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount } from "./AccountProvider";
import type { Intake, BookingReason } from "@/lib/booking-intake";

const BookingDraftContext = createContext<{
  intake: Intake | null; reason: BookingReason | null;
  clearDraft: () => void; setIntake: (value: Intake) => void; setReason: (value: BookingReason) => void;
}>({ intake: null, reason: null, clearDraft: () => {}, setIntake: () => {}, setReason: () => {} });
export const useBookingDraft = () => useContext(BookingDraftContext);
export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [intake, setIntake] = useState<Intake | null>(null);
  const [reason, setReason] = useState<BookingReason | null>(null);
  const { user, loading } = useAccount();
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (previousUser.current && previousUser.current !== user?.id) { setIntake(null); setReason(null); }
    previousUser.current = user?.id ?? null;
  }, [user?.id, loading]);
  const clearDraft = useCallback(() => { setIntake(null); setReason(null); }, []);
  return <BookingDraftContext.Provider value={{ intake, reason, clearDraft, setIntake, setReason }}>{children}</BookingDraftContext.Provider>;
}
