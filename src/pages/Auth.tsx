import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { MOCK_LOGIN_ENABLED, mockLoginDestination } from "@/lib/mock-login";

// Send each signed-in user to the page that fits their role.
const routeForUser = async (userId: string) => {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("doctor")) return "/doctor-dashboard";
  return "/my-visits";
};

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPatient = searchParams.get("as") === "patient";
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (MOCK_LOGIN_ENABLED) return;
    const go = async (userId: string) => navigate(await routeForUser(userId), { replace: true });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) go(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Defer the database call so it doesn't run inside the auth callback.
        setTimeout(() => go(session.user.id), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (MOCK_LOGIN_ENABLED) {
      setPassword("");
      navigate(mockLoginDestination(isPatient ? "patient" : "doctor"));
      return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: t('auth.welcomeBack'),
        description: t('auth.loggedIn'),
      });
    } catch (error: any) {
      toast({
        title: t('auth.loginFailed'),
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
            <h1 className="text-2xl font-bold text-primary">{isPatient ? t('header.brand') : t('header.doctors')}</h1>
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
            <h2 className="text-3xl font-bold mb-2">{isPatient ? t('auth.patientTitle') : t('auth.title')}</h2>
            <p className="text-muted-foreground">
              {isPatient ? t('auth.patientSubtitle') : t('auth.subtitle')}
            </p>
          </div>

          <div className="bg-card p-8 rounded-xl border shadow-sm">
            {MOCK_LOGIN_ENABLED && <p className="mb-4 text-sm text-muted-foreground">Demo login · No real account required</p>}
            {isPatient && (
              <p className="mb-6 rounded-lg bg-accent/50 p-3 text-sm text-muted-foreground">
                {t('auth.patientHint')}
              </p>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t('auth.email')}</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">{t('auth.password')}</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <Button type="submit" className="w-full h-12" disabled={loading}>
                {loading ? t('auth.loggingIn') : t('auth.loginButton')}
              </Button>

              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  className="p-0 h-auto text-sm text-muted-foreground"
                  onClick={() => navigate("/reset-password")}
                >
                  Forgot password?
                </Button>
              </div>

              {!isPatient && (
                <p className="text-center text-xs text-muted-foreground">
                  Doctor accounts are created by DocNow administrators.
                </p>
              )}
            </form>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            {MOCK_LOGIN_ENABLED && !isPatient && (
              <Button variant="link" onClick={() => navigate(mockLoginDestination("admin"))}>Admin preview</Button>
            )}
            {!isPatient && (
              <Button
                variant="link"
                className="text-sm"
                onClick={() => setSearchParams({ as: "patient" })}
              >
                {t('auth.switchToPatient')}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
            >
              {t('auth.backToHome')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
