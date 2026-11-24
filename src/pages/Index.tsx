import { Link, useNavigate } from "react-router-dom";
import { LogOut, User, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BookingAvailability from "@/components/BookingAvailability";
import { CONSULTATION_PRICE_AED } from "@/lib/booking-intake";
import doctorVideoCall from "@/assets/doctor-video-call.jpg";

import { useAccount } from "@/components/AccountProvider";
import { accountDestination } from "@/lib/account-access";
import { supabase } from "@/integrations/supabase/client";


const bookingSteps = ["step1", "step2", "step3"] as const;

export default function Index() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, access } = useAccount();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const getPortalLabel = () => {
    if (access === "doctor") return t("header.doctorDashboard", "Doctor portal");
    if (access === "admin") return t("header.adminPortal", "Admin portal");
    return t("header.myVisits", "My visits");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:py-3">
          <Link to="/" className="text-2xl font-bold tracking-tight text-primary">{t("header.brand")}</Link>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            {user && access ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to={accountDestination(access)}><User aria-hidden="true" />{getPortalLabel()}</Link>
                </Button>
                <Button variant="ghost" size="icon" aria-label={t("header.logout")} onClick={() => void handleLogout()}>
                  <LogOut aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth?as=patient">{t("auth.patientTitle")}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="bg-gradient-to-b from-accent/40 to-background py-8 sm:py-12 lg:py-20">
          <div className="container mx-auto grid max-w-6xl items-center gap-7 px-4 lg:grid-cols-2 lg:gap-14">
            <div className="text-center lg:text-start">
              <BookingAvailability />
              <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl">
                {t("hero.title")}
              </h1>
              <Button asChild size="lg" className="h-auto min-h-11 w-full px-5 py-2.5 text-base sm:w-auto">
                <Link to="/registration">
                  <Video aria-hidden="true" />
                  {t("hero.bookButton")}
                </Link>
              </Button>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("hero.bookingFee", { amount: CONSULTATION_PRICE_AED })}
              </p>
            </div>

            <img
              src={doctorVideoCall}
              alt=""
              width={1280}
              height={896}
              className="aspect-[16/10] w-full rounded-2xl border object-cover"
            />
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="border-t py-8 sm:py-12">
          <div className="container mx-auto max-w-6xl px-4">
            <h2 id="how-it-works" className="mb-5 text-2xl font-semibold">{t("howItWorks.title")}</h2>
            <ol className="grid gap-3 sm:grid-cols-3">
              {bookingSteps.map((step, index) => (
                <li key={step} className="flex items-start gap-3 rounded-xl border p-4">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{t(`howItWorks.${step}.title`)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t(`howItWorks.${step}.description`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/30 py-5">
        <div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-sm text-muted-foreground">
          <p>{t("footer.copyright")}</p>
          <Link to="/doctor/login" className="py-2 underline underline-offset-4 hover:text-primary">
            {t("header.doctorPortal")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
