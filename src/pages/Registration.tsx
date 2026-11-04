import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const Registration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [passportNumber, setPassportNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [allergies, setAllergies] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passportNumber || !fullName || !dateOfBirth || !email || !phone) {
      toast({
        title: t('registration.fillAllFields'),
        description: t('registration.allInfoRequired'),
        variant: "destructive",
      });
      return;
    }

    // Store registration data in sessionStorage
    const formData = {
      fullName,
      dateOfBirth,
      passportNumber,
      email,
      phone,
      allergies: allergies.trim().slice(0, 500),
    };
    sessionStorage.setItem("registrationData", JSON.stringify(formData));
    
    toast({
      title: t('registration.verificationComplete'),
      description: t('registration.proceedingToPayment'),
    });
    
    navigate("/medical-reason");
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
                onClick={() => navigate("/")}
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
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-2">{t('registration.title')}</h2>
            <p className="text-muted-foreground">
              {t('registration.subtitle')}
            </p>
          </div>

          <div className="bg-card p-8 rounded-xl border shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('registration.fullName')} *</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder={t('registration.fullNamePlaceholder')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">{t('registration.personalNumber')} *</Label>
                <Input
                  id="dateOfBirth"
                  type="text"
                  placeholder={t('registration.personalNumberPlaceholder')}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passport">{t('registration.passportNumber')} *</Label>
                <Input
                  id="passport"
                  type="text"
                  placeholder={t('registration.passportPlaceholder')}
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  required
                  className="h-12"
                />
                <p className="text-sm text-muted-foreground">
                  {t('registration.passportHelper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('registration.email')} *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('registration.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('registration.phone')} *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={t('registration.phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="allergies">Allergies (optional)</Label>
                <Input
                  id="allergies"
                  placeholder="e.g. Penicillin, peanuts. Leave empty if none"
                  value={allergies}
                  maxLength={500}
                  onChange={(e) => setAllergies(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="bg-muted/50 p-4 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  <ShieldCheck className="inline w-4 h-4 mr-1 text-primary" />
                  {t('registration.securityNote')}
                </p>
              </div>

              <Button type="submit" className="w-full h-12 text-base" size="lg">
                {t('registration.continueButton')}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {t('registration.termsNote')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Registration;
