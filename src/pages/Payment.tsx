import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Lock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";

const Payment = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // TESTING: card number is not validated — any value (or none) is accepted.
    if (!expiryDate || !cvv || !cardName) {
      toast({
        title: t('payment.fillAllFields'),
        description: t('payment.allInfoRequired'),
        variant: "destructive",
      });
      return;
    }

    const registrationData = sessionStorage.getItem("registrationData");
    const medicalReasonData = sessionStorage.getItem("medicalReason");
    
    if (!registrationData || !medicalReasonData) {
      toast({
        title: "Registration data not found",
        variant: "destructive",
      });
      navigate("/registration");
      return;
    }

    const userData = JSON.parse(registrationData);
    const medicalReason = JSON.parse(medicalReasonData);

    try {
      // Make sure we have an authenticated session (required by security rules)
      let { data: { session } } = await supabase.auth.getSession();

      // If a different person is signed in (e.g. a previous patient or a doctor/admin
      // on the same device), sign them out so this booking goes to the right patient.
      if (
        session &&
        session.user.email?.toLowerCase() !== String(userData.email).trim().toLowerCase()
      ) {
        await supabase.auth.signOut();
        session = null;
      }

      if (!session) {
        const generatedPassword = `${crypto.randomUUID()}Aa1!`;

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: userData.email,
          password: generatedPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: userData.fullName },
          },
        });

        if (signUpError) {
          if (signUpError.message?.toLowerCase().includes("already registered")) {
            toast({
              title: "Account already exists",
              description: "Please sign in with this email before booking.",
              variant: "destructive",
            });
            navigate("/auth");
            return;
          }
          throw signUpError;
        }

        session = signUpData.session;

        if (!session) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: userData.email,
            password: generatedPassword,
          });
          if (signInError) throw signInError;
          session = signInData.session;
        }
      }

      const user = session?.user;
      if (!user) throw new Error("Could not create your account session");

      // Save patient details on the profile
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          email: userData.email,
          full_name: userData.fullName,
          phone: userData.phone,
          passport_number: userData.passportNumber,
          date_of_birth: userData.dateOfBirth,
          allergies: typeof userData.allergies === "string" && userData.allergies.trim()
            ? userData.allergies.trim().slice(0, 500)
            : null,
        });

      if (profileError) throw profileError;

      const { data: consultationData, error: consultationError } = await supabase
        .from("consultations")
        .insert({
          patient_id: user.id,
          payment_status: "paid",
          payment_amount: 249,
          status: "pending",
          reason_category: medicalReason.category,
          reason_description: medicalReason.description,
          ...(() => {
            const c = JSON.parse(sessionStorage.getItem("consent") || "null");
            if (!c) throw new Error("Consent missing. Please go back and confirm the consent statements.");
            return {
              telehealth_consent_at: c.at,
              privacy_consent_at: c.at,
              emergency_disclaimer_ack_at: c.at,
              consent_version: c.version,
            };
          })(),
        })
        .select()
        .single();

      if (consultationError) throw consultationError;

      sessionStorage.removeItem("registrationData");
      sessionStorage.removeItem("medicalReason");
      sessionStorage.removeItem("consent");

      toast({
        title: t('payment.paymentComplete'),
        description: t('payment.appointmentBooked'),
      });

      navigate(`/waiting-room?id=${consultationData.id}`);
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(" ");
    } else {
      return value;
    }
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    if (v.length >= 2) {
      return v.slice(0, 2) + "/" + v.slice(2, 4);
    }
    return v;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/registration")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold text-primary">{t('header.brand')}</h1>
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-lg mx-auto">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-2">{t('payment.title')}</h2>
            <p className="text-muted-foreground">
              {t('payment.subtitle')}
            </p>
          </div>

          <div className="bg-accent/30 border border-primary/20 p-6 rounded-xl mb-8">
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg text-muted-foreground">{t('payment.consultationLabel')}</span>
              <span className="text-3xl font-bold text-foreground">{t('payment.price')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span>{t('payment.includesReceipt')}</span>
            </div>
          </div>

          <div className="bg-card p-8 rounded-xl border shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="cardName">{t('payment.cardHolder')} *</Label>
                <Input
                  id="cardName"
                  type="text"
                  placeholder={t('payment.cardHolderPlaceholder')}
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cardNumber">{t('payment.cardNumber')}</Label>
                <div className="relative">
                  <Input
                    id="cardNumber"
                    type="text"
                    placeholder={t('payment.cardNumberPlaceholder')}
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="h-12 pr-12"
                  />
                  <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiry">{t('payment.expiryDate')} *</Label>
                  <Input
                    id="expiry"
                    type="text"
                    placeholder={t('payment.expiryPlaceholder')}
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                    maxLength={5}
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cvv">{t('payment.cvv')} *</Label>
                  <Input
                    id="cvv"
                    type="text"
                    placeholder={t('payment.cvvPlaceholder')}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
                    maxLength={3}
                    required
                    className="h-12"
                  />
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg border">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    {t('payment.securityNote')}
                  </p>
                </div>
              </div>

              <Button type="submit" className="w-full h-12 text-base" size="lg">
                {t('payment.payButton')}
              </Button>
            </form>
          </div>

          <div className="mt-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('payment.securePayment')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('payment.chargeNote')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;
