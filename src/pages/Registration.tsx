import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, TriangleAlert, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/components/AccountProvider";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bookingCountries, defaultBookingCountry, formatBookingPhone, getCountryCallingCode, splitBookingPhone, type CountryCode } from "@/lib/booking-phone";

const Registration = () => {
  const navigate = useNavigate();
  const { user } = useAccount();
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [passportNumber, setPassportNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(defaultBookingCountry);
  const countryNames = new Intl.DisplayNames([i18n.language], { type: "region" });
  const countries = [...bookingCountries].sort((a, b) => (countryNames.of(a) ?? a).localeCompare(countryNames.of(b) ?? b, i18n.language));

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || "");
    supabase.from("profiles").select("full_name, phone, passport_number, date_of_birth").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      const contact = splitBookingPhone(data.phone || "");
      setFullName(data.full_name); setPhone(contact.national); setPhoneCountry(contact.country); setPassportNumber(data.passport_number || ""); setDateOfBirth(data.date_of_birth || "");
    });
  }, [user]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passportNumber || !fullName || !dateOfBirth || !email || !phone) {
      toast({
        title: t('registration.fillAllFields'),
        description: t('registration.allInfoRequired'),
        variant: "destructive",
      });
      return;
    }

    const internationalPhone = formatBookingPhone(phone, phoneCountry);
    if (!internationalPhone) {
      toast({ title: t('registration.invalidPhone'), description: t('registration.phoneHelper'), variant: "destructive" });
      return;
    }
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim(), phone: internationalPhone, passport_number: passportNumber.trim(), date_of_birth: dateOfBirth }).eq("id", user.id);
    setSaving(false);
    if (error) { toast({ title: "Could not save details", description: error.message, variant: "destructive" }); return; }
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

          <aside aria-labelledby="emergency-heading" className="mb-6 border-l-4 border-destructive bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-2">
                <h3 id="emergency-heading" className="font-semibold">{t('registration.emergencyTitle')}</h3>
                <p className="text-sm text-muted-foreground">{t('registration.emergencyText')}</p>
                <Button asChild variant="outline" size="sm"><a href="tel:998"><Phone className="mr-2 h-4 w-4" />{t('registration.callAmbulance')}</a></Button>
                <p className="text-xs text-muted-foreground">{t('registration.outsideUae')}</p>
              </div>
            </div>
          </aside>

          <div className="bg-card p-5 sm:p-8 rounded-xl border shadow-sm">
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
                  readOnly
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
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2" dir="ltr">
                <Select value={phoneCountry} onValueChange={(value) => { if (bookingCountries.includes(value as CountryCode)) setPhoneCountry(value as CountryCode); }}>
                  <SelectTrigger aria-label={t('registration.countryCode')} className="h-12">
                    <SelectValue>{phoneCountry} +{getCountryCallingCode(phoneCountry)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {countries.map((country) => <SelectItem key={country} value={country}>{countryNames.of(country) ?? country} (+{getCountryCallingCode(country)})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={32}
                  aria-describedby="phone-helper"
                  placeholder={t('registration.phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="h-12 min-w-0"
                />
                </div>
                <p id="phone-helper" className="text-xs text-muted-foreground">{t('registration.phoneHelper')}</p>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  <ShieldCheck className="inline w-4 h-4 mr-1 text-primary" />
                  {t('registration.securityNote')}
                </p>
              </div>

              <Button disabled={saving} type="submit" className="w-full h-12 text-base" size="lg">
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
