import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/components/AccountProvider";

import { useAuthChallenge } from "@/components/AuthChallenge";

const ResetPassword = () => {
  const captcha = useAuthChallenge();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settingPassword = params.get("mode") === "setup";
  const { user } = useAccount();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const recoveryEmail = (settingPassword && user?.email ? user.email : email).trim().toLowerCase();
  const fromVisits = settingPassword && !!user;

  useEffect(() => {
    // A recovery link signs the user in with a temporary session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
    });

    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captcha.ready || loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
        captchaToken: captcha.token,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast({
        title: t("recovery.inbox"),
        description: t("recovery.sentLink"),
      });
    } catch (error: any) {
      toast({
        title: t("recovery.sendFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      captcha.reset();
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({
        title: t("recovery.updated"),
        description: t("recovery.updatedHint"),
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: t("recovery.updateFailed"),
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
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" aria-label={t(fromVisits ? "lounge.back" : "auth.backLogin")}
              onClick={() => navigate(fromVisits ? "/my-visits" : "/auth")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-primary">DocNow</h1>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <KeyRound className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-2">
              {isRecovery || settingPassword ? t("recovery.setTitle") : t("recovery.title")}
            </h2>
            <p className="text-muted-foreground">
              {isRecovery
                ? t("recovery.setHint")
                : t("recovery.hint")}
            </p>
          </div>

          <div className="bg-card p-8 rounded-xl border shadow-sm">
            {isRecovery ? (
              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("recovery.password")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-12"
                  />
                  <p className="text-sm text-muted-foreground">{t("recovery.minimum")}</p>
                </div>
                <Button type="submit" className="w-full h-12" disabled={loading}>
                  {loading ? t("recovery.saving") : t("recovery.save")}
                </Button>
              </form>
            ) : sent ? (
              <p className="text-center text-muted-foreground">
                {t("recovery.sent", { email: recoveryEmail })}
              </p>
            ) : (
              <form onSubmit={handleRequest} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">{t("recovery.email")}</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={settingPassword && user?.email ? user.email : email}
                    readOnly={settingPassword && !!user?.email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>
                {captcha.challenge}
                <Button type="submit" className="w-full h-12" disabled={loading || !captcha.ready}>
                  {t(loading ? "recovery.sending" : settingPassword ? "bookingEmail.setPassword" : "recovery.send")}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
