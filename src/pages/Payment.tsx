import { Button } from "@/components/ui/button";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBookingDraft } from "@/components/BookingDraftProvider";
import { CONSULTATION_PRICE_AED } from "@/lib/booking-intake";
import { CreditCard, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBookingPhone } from "@/lib/booking-phone";
import { intakeSchema, reasonSchema } from "@/lib/booking-intake";
import { toast } from "sonner";
export default function Payment() {
 const navigate = useNavigate();
 const { t } = useTranslation();
 const { intake, reason } = useBookingDraft();
 const [submitting, setSubmitting] = useState(false);
 const inFlight = useRef(false);
 const continueBooking = async () => {
  if (inFlight.current || !intake || !reason) return;
  const details = intakeSchema.safeParse(intake); const symptoms = reasonSchema.safeParse(reason);
  if (!details.success || !symptoms.success) { toast.error(t('registration.fillAllFields')); return; }
  inFlight.current = true; setSubmitting(true);
  try {
   const { data, error } = await supabase.rpc('book_unpaid_consultation', {
    _intake: { ...details.data, phone: details.data.phone ? formatBookingPhone(details.data.phone, details.data.country) : '' },
    _reason: symptoms.data,
   });
   if (error) throw error;
   if (!data) throw new Error(t('payment.bookingFailed'));
   navigate(`/waiting-room?id=${encodeURIComponent(data)}`, { replace: true });
  } catch (error) {
   const message = error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string" ? (error as { message: string }).message : "";
   toast.error(message || t('payment.bookingFailed'));
  }
  finally { inFlight.current = false; setSubmitting(false); }
 };
 if (!intake || !reason) return <Navigate to="/registration" replace />;
 return <div className="min-h-screen bg-background">
  <header className="border-b bg-card"><div className="container mx-auto flex items-center justify-between px-4 py-4"><h1 className="text-2xl font-bold text-primary">{t('header.brand')}</h1><LanguageSwitcher /></div></header>
  <main className="mx-auto max-w-lg space-y-6 px-4 py-12">
   <h2 className="text-3xl font-bold">{t('payment.title')}</h2>
   <div className="flex items-center justify-between gap-4 border-y py-6"><div className="flex items-center gap-3"><CreditCard aria-hidden="true" className="h-6 w-6 text-primary" /><span>{t('payment.consultationLabel')}</span></div><strong className="whitespace-nowrap text-xl">{CONSULTATION_PRICE_AED} AED</strong></div>
   <p role="status">{t('payment.unavailable')}</p>
   <p className="text-sm text-muted-foreground">{t('payment.insuranceUnavailable')}</p>
   <Button disabled={submitting} onClick={() => void continueBooking()} className="h-12 w-full">{t(submitting ? 'payment.booking' : 'payment.continueUnpaid')}</Button>
   <Button variant="outline" onClick={() => navigate('/medical-reason')}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />{t('payment.backToReason')}</Button>
  </main>
 </div>;
}
