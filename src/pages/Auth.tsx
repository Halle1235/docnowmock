import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Shield, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useAccount } from "@/components/AccountProvider";
import { accountDestination } from "@/lib/account-access";
import { bookingReturnPath } from "@/lib/booking-intake";

import { useBookingDraft } from "@/components/BookingDraftProvider";
import BookingEmailCode from "@/components/BookingEmailCode";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPatient = searchParams.get("as") !== "doctor";
  const signingUp = searchParams.get("mode") === "signup";
  const returnTo = bookingReturnPath(searchParams.get("returnTo"));
  const { intake, clearDraft } = useBookingDraft();
  const wantsCode = isPatient && returnTo === "/medical-reason" && searchParams.get("method") === "email-code";
  const bookingEmail = intake?.email.toLowerCase();
  const updateParams = (values: Record<string, string>) =>
    setSearchParams({ ...values, ...(returnTo ? { returnTo } : {}) });
  const { user, access, loading: checking } = useAccount();
  const [fullName, setFullName] = useState("");
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(returnTo === "/medical-reason" ? bookingEmail ?? "" : "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (checking || !user || !access) return;

    if (isPatient) {
      if (access === "patient" || access === "pending") {
        if (returnTo === "/medical-reason" && bookingEmail !== user.email?.toLowerCase()) {
          clearDraft();
          navigate("/registration", { replace: true });
          return;
        }
        navigate(returnTo || "/my-visits", { replace: true });
        return;
      }
      navigate(accountDestination(access), { replace: true });
      return;
    }

    // Doctor portal
    if (access === "doctor" || access === "admin") {
      navigate(accountDestination(access), { replace: true });
      return;
    }

    if (access === "pending") {
      navigate("/doctor/register", { replace: true });
      return;
    }

    // Accounts without a doctor application continue to the licence form; the server rejects existing patients
    if (access === "patient") {
      navigate("/doctor/register", { replace: true });
      return;
    }
  }, [user, access, checking, navigate, isPatient, returnTo, bookingEmail, clearDraft]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (signingUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?as=${isPatient ? "patient" : "doctor"}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`,
            data: {
              full_name: fullName.trim(),
              user_type: isPatient ? "patient" : "doctor",
            },
          },
        });
        if (error) throw error;
        setPassword("");
        if (!data.session) {
          setSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }

      toast({
        title: t("auth.welcomeBack"),
        description: t("auth.loggedIn"),
      });
    } catch (error: any) {
      toast({
        title: t("auth.loginFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-primary">{isPatient ? t("header.brand") : t("header.doctors")}</h1>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              {isPatient ? <User className="w-8 h-8 text-primary" /> : <Shield className="w-8 h-8 text-primary" />}
            </div>
            <h2 className="text-3xl font-bold mb-2">
              {wantsCode ? t("bookingEmail.title") : signingUp ? t("auth.create") : isPatient ? t("auth.patientTitle") : t("auth.title")}
            </h2>
            <p className="text-muted-foreground">{wantsCode ? t("bookingEmail.hint") : isPatient ? t("auth.patientSubtitle") : t("auth.subtitle")}</p>
          </div>

          {/* Patient account attempting to access doctor portal */}
          {!isPatient && user && access === "patient" ? (
            <div className="bg-card p-8 rounded-xl border border-amber-500/30 bg-amber-500/[0.03] shadow-sm text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold">{t("auth.patientAccountBlockedTitle", "Patient account detected")}</h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "auth.patientAccountBlockedDesc",
                  "This account is registered as a patient. The Doctor Portal is reserved for verified healthcare providers and DHA-licensed doctors. Patients cannot access the doctor portal or apply using a patient account.",
                  { email: user.email },
                )}
              </p>
              <div className="flex flex-col gap-2.5 pt-2">
                <Button onClick={() => navigate(returnTo || "/my-visits")}>
                  {t("auth.goToPatientVisits", "Go to my patient visits")}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await supabase.auth.signOut();
                  }}
                >
                  {t("auth.signOutDifferentAccount", "Sign out / Use another account")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-card p-8 rounded-xl border shadow-sm">
              {wantsCode ? (
              bookingEmail ? (
                <BookingEmailCode key={bookingEmail} email={bookingEmail}
                  sentAt={typeof location.state?.sentAt === "number" ? location.state.sentAt : 0}
                  sendFailed={location.state?.sendFailed === true}
                  onEditEmail={() => navigate("/registration")}
                  onPasswordLogin={() => updateParams({ as: "patient" })} />
              ) : (
                <div className="space-y-4">
                  <p>{t("bookingEmail.expiredDraft")}</p>
                  <Button asChild><Link to="/registration">{t("bookingEmail.backDetails")}</Link></Button>
                </div>
              )
            ) : sent ? (
                <div className="space-y-4">
                  <p role="status">{t("auth.confirmEmail")}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSent(false);
                      updateParams({ as: isPatient ? "patient" : "doctor" });
                    }}
                  >
                    {t("auth.backLogin")}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  {signingUp && (
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">{t("registration.fullName")}</Label>
                      <Input
                        id="signup-name"
                        required
                        minLength={2}
                        maxLength={120}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t("auth.email")}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder={t("auth.emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t("auth.password")}</Label>
                    <Input
                      minLength={signingUp ? 10 : undefined}
                      autoComplete={signingUp ? "new-password" : "current-password"}
                      id="login-password"
                      type="password"
                      placeholder={t("auth.passwordPlaceholder")}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>

                  <Button type="submit" className="w-full h-12" disabled={loading}>
                    {loading ? t("dashboard.loading") : signingUp ? t("auth.create") : t("auth.loginButton")}
                  </Button>

                  <div className="text-center">
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto text-sm text-muted-foreground"
                      onClick={() => navigate("/reset-password")}
                    >
                      {t("auth.forgot")}
                    </Button>
                  </div>

                  {!isPatient && (
                    <p className="text-center text-xs text-muted-foreground">
                      {t("auth.approval")}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="link"
                    className="w-full"
                    onClick={() =>
                      updateParams({ as: isPatient ? "patient" : "doctor", mode: signingUp ? "login" : "signup" })
                    }
                  >
                    {t(signingUp ? "auth.existing" : "auth.create")}
                  </Button>
                </form>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            {!isPatient && (
              <Button variant="link" className="text-sm" onClick={() => setSearchParams({ as: "patient" })}>
                {t("auth.switchToPatient")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate("/")}>
              {t("auth.backToHome")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
