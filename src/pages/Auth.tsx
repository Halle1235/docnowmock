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
import { useAccount } from "@/components/AccountProvider";
import { accountDestination } from "@/lib/account-access";
import SocialSignIn from "@/components/SocialSignIn";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPatient = searchParams.get("as") !== "doctor";
  const signingUp = searchParams.get("mode") === "signup";
  const { user, access, loading: checking } = useAccount();
  const [fullName, setFullName] = useState("");
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (checking || !user || !access) return;
    navigate(!isPatient && access === "patient" ? "/doctor/register" : accountDestination(access), { replace: true });
  }, [user, access, checking, navigate, isPatient]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (signingUp) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/auth?as=${isPatient ? "patient" : "doctor"}`, data: { full_name: fullName.trim() } } });
        if (error) throw error;
        setPassword("");
        if (!data.session) { setSent(true); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }

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
            <h2 className="text-3xl font-bold mb-2">{signingUp ? "Create account" : isPatient ? t('auth.patientTitle') : t('auth.title')}</h2>
            <p className="text-muted-foreground">
              {isPatient ? t('auth.patientSubtitle') : t('auth.subtitle')}
            </p>
          </div>

          <div className="bg-card p-8 rounded-xl border shadow-sm">

            {sent ? <div className="space-y-4"><p role="status">Check your email to confirm your account before signing in.</p><Button variant="outline" onClick={() => { setSent(false); setSearchParams({ as: isPatient ? "patient" : "doctor" }); }}>Back to sign in</Button></div> : <form onSubmit={handleLogin} className="space-y-4">
              {signingUp && <div className="space-y-2"><Label htmlFor="signup-name">Full name</Label><Input id="signup-name" required minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} /></div>}
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
                  minLength={signingUp ? 10 : undefined}
                  autoComplete={signingUp ? "new-password" : "current-password"}
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
                {loading ? "Please wait…" : signingUp ? "Create account" : t('auth.loginButton')}
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
                  Doctor accounts require administrator licence approval.
                </p>
              )}
              <Button type="button" variant="link" className="w-full" onClick={() => setSearchParams({ as: isPatient ? "patient" : "doctor", mode: signingUp ? "login" : "signup" })}>{signingUp ? "Already have an account? Sign in" : "Create an account"}</Button>
              <SocialSignIn />
            </form>}
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 text-center">
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
