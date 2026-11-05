import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Video, Shield, Clock, CheckCircle, LogOut, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import doctorVideoCall from "@/assets/doctor-video-call.jpg";
import { useAccount } from "@/components/AccountProvider";
import { accountDestination } from "@/lib/account-access";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
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
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-primary cursor-pointer" onClick={() => navigate("/")}>
              {t("header.brand")}
            </h1>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              {user ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(accountDestination(access || "patient"))}
                    className="font-medium gap-1.5 shadow-sm"
                  >
                    <User className="h-4 w-4 text-primary" />
                    {getPortalLabel()}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4 me-1" />
                    {t("header.logout")}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth?as=patient")}>
                  {t("header.login")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-muted/20 py-16 md:py-24">
        <div className="container relative mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-6xl mx-auto">
            {/* Copy */}
            <div className="text-center lg:text-left order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-6 text-sm font-medium text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                {t("hero.waitTime")}
              </div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-foreground tracking-tight leading-[1.1]">
                {t("hero.title")}
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                {t("hero.subtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Button
                  onClick={() => navigate("/registration")}
                  size="lg"
                  className="text-base px-8 py-6 h-auto shadow-md hover:shadow-lg transition-all"
                >
                  <Video className="w-5 h-5 mr-2" />
                  {t("hero.bookButton")}
                </Button>
              </div>
            </div>

            {/* Image */}
            <div className="relative order-1 lg:order-2">
              <div className="relative rounded-2xl overflow-hidden border border-border shadow-xl bg-card">
                <img
                  src={doctorVideoCall}
                  alt="Doctor video calling a patient on a telemedicine consultation"
                  width={1280}
                  height={896}
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-card p-8 rounded-xl border hover:shadow-md transition-shadow">
                <Video className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">{t("features.videoConsultation.title")}</h3>
                <p className="text-muted-foreground leading-relaxed">{t("features.videoConsultation.description")}</p>
              </div>

              <div className="bg-card p-8 rounded-xl border hover:shadow-md transition-shadow">
                <Shield className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">{t("features.licensedDoctors.title")}</h3>
                <p className="text-muted-foreground leading-relaxed">{t("features.licensedDoctors.description")}</p>
              </div>

              <div className="bg-card p-8 rounded-xl border hover:shadow-md transition-shadow">
                <Clock className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">{t("features.quickAccess.title")}</h3>
                <p className="text-muted-foreground leading-relaxed">{t("features.quickAccess.description")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">{t("howItWorks.title")}</h2>

            <div className="space-y-8">
              <div className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                    1
                  </div>
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">{t("howItWorks.step1.title")}</h4>
                  <p className="text-muted-foreground">{t("howItWorks.step1.description")}</p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                    2
                  </div>
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">{t("howItWorks.step2.title")}</h4>
                  <p className="text-muted-foreground">{t("howItWorks.step2.description")}</p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                    3
                  </div>
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">{t("howItWorks.step3.title")}</h4>
                  <p className="text-muted-foreground">{t("howItWorks.step3.description")}</p>
                </div>
              </div>
            </div>

            <div className="mt-12 p-6 bg-accent/50 rounded-xl border border-primary/20">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-2">{t("howItWorks.security.title")}</h4>
                  <p className="text-sm text-muted-foreground">{t("howItWorks.security.description")}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Button onClick={() => navigate("/registration")} size="lg" className="px-12">
                {t("howItWorks.getStarted")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>{t("footer.copyright")}</p>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2">
              {t("footer.tagline")
                .split("•")
                .map((part: string, i: number, arr: string[]) => (
                  <span key={i} className="flex items-center gap-x-2">
                    <span>{part.trim()}</span>
                    {i < arr.length - 1 && <span aria-hidden>•</span>}
                  </span>
                ))}
              <span aria-hidden>•</span>
              <button
                onClick={() => navigate("/auth?as=doctor")}
                className="hover:text-primary underline-offset-4 hover:underline transition-colors"
              >
                {t("header.doctorPortal")}
              </button>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
