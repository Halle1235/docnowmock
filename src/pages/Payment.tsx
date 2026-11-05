import { Button } from "@/components/ui/button";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBookingDraft } from "@/components/BookingDraftProvider";
import { CONSULTATION_PRICE_AED } from "@/lib/booking-intake";
import { CreditCard, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
export default function Payment() {
 const navigate = useNavigate();
 const { t } = useTranslation();
 const { intake, reason } = useBookingDraft();
 if (!intake || !reason) return <Navigate to="/registration" replace />;
 return <div className="min-h-screen bg-background">
  <header className="border-b bg-card"><div className="container mx-auto flex items-center justify-between px-4 py-4"><h1 className="text-2xl font-bold text-primary">{t('header.brand')}</h1><LanguageSwitcher /></div></header>
  <main className="mx-auto max-w-lg space-y-6 px-4 py-12">
   <h2 className="text-3xl font-bold">{t('payment.title')}</h2>
   <div className="flex items-center justify-between gap-4 border-y py-6"><div className="flex items-center gap-3"><CreditCard aria-hidden="true" className="h-6 w-6 text-primary" /><span>{t('payment.consultationLabel')}</span></div><strong className="whitespace-nowrap text-xl">{CONSULTATION_PRICE_AED} AED</strong></div>
   <p role="status">{t('payment.unavailable')}</p>
   <p className="text-sm text-muted-foreground">{t('payment.insuranceUnavailable')}</p>
   <Button disabled className="h-12 w-full">{t('payment.checkoutUnavailable')}</Button>
   <Button variant="outline" onClick={() => navigate('/medical-reason')}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />{t('payment.backToReason')}</Button>
  </main>
 </div>;
}
