import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, TriangleAlert, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/components/AccountProvider";
import { useBookingDraft } from "@/components/BookingDraftProvider";
import { intakeSchema } from "@/lib/booking-intake";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BookingAvailability from "@/components/BookingAvailability";
import { sendBookingCode } from "@/lib/booking-email";
import * as CountryFlags from "country-flag-icons/react/3x2";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bookingCountries, defaultBookingCountry, getCountryCallingCode, splitBookingPhone, type CountryCode } from "@/lib/booking-phone";

const CountryFlag = ({ country }: { country: CountryCode }) => {
  const Flag = CountryFlags[country as keyof typeof CountryFlags];
  return Flag ? <Flag aria-hidden="true" className="h-4 w-6 shrink-0" /> : null;
};

const Registration = () => {
  const navigate = useNavigate();
  const { user, access, loading: checkingAccount } = useAccount();
  const { intake, setIntake } = useBookingDraft();
  const [identityType, setIdentityType] = useState<"resident" | "visitor">(intake?.identity.type ?? "resident");
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [passportNumber, setPassportNumber] = useState(intake?.identity.number ?? "");
  const [fullName, setFullName] = useState(intake?.fullName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(intake?.dateOfBirth ?? "");
  const [email, setEmail] = useState(intake?.email ?? "");
  const [phone, setPhone] = useState(intake?.phone ?? "");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(intake?.country ?? defaultBookingCountry);
  const countryNames = new Intl.DisplayNames([i18n.language], { type: "region" });
  const countries = [...bookingCountries].sort((a, b) => (countryNames.of(a) ?? a).localeCompare(countryNames.of(b) ?? b, i18n.language));

  useEffect(() => {
    if (intake || !user || access !== "patient") return;
    setEmail(user.email || "");
    let active = true;
    supabase.from("profiles").select("full_name, phone, passport_number, date_of_birth, identification_type, emirates_id, contact_email").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (!active || !data) return;
      const contact = splitBookingPhone(data.phone || "");
      setFullName(data.full_name); setPhone(contact.national); setPhoneCountry(contact.country);
      setEmail(data.contact_email || user.email || "");
      const identity = data.identification_type === 'resident' ? data.emirates_id || '' : data.passport_number || "";
      setPassportNumber(identity); setIdentityType(data.identification_type === 'resident' || /^784-/.test(identity) ? "resident" : identity ? "visitor" : "resident");
      setDateOfBirth(/^\d{4}-\d{2}-\d{2}$/.test(data.date_of_birth || "") ? data.date_of_birth || "" : "");
    });
    return () => { active = false; };
  }, [user?.id, access, intake]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkingAccount || sendingRef.current) return;
    const result = intakeSchema.safeParse({ fullName, email, phone, country: phoneCountry, dateOfBirth, identity: { type: identityType, number: passportNumber } });
    if (!result.success) {
      toast({ title: t('registration.fillAllFields'), description: result.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    setIntake(result.data);
    if (user) {
      navigate("/medical-reason");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    const verificationPath = "/auth?as=patient&method=email-code&returnTo=%2Fmedical-reason";
    try {
      await sendBookingCode(result.data.email.toLowerCase());
      navigate(verificationPath, { state: { sentAt: Date.now() } });
    } catch {
      navigate(verificationPath, { state: { sendFailed: true } });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
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
                aria-label={t("auth.backToHome")}
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

          <BookingAvailability />
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

          <div className="py-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('registration.fullName')} *</Label>
                <Input
                  maxLength={120}
                  autoComplete="name"
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
                <Label htmlFor="dateOfBirth">{t('registration.dateOfBirth')} *</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  autoComplete="bday"
                  min="1900-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label>{t('registration.identification')}</Label>
                <ToggleGroup type="single" value={identityType} onValueChange={value => { if (value === "resident" || value === "visitor") { setIdentityType(value); setPassportNumber(""); } }} variant="outline" className="grid grid-cols-2 gap-2">
                  <ToggleGroupItem value="resident" className="h-auto min-h-12 whitespace-normal py-2">{t('registration.resident')}</ToggleGroupItem>
                  <ToggleGroupItem value="visitor" className="h-auto min-h-12 whitespace-normal py-2">{t('registration.visitor')}</ToggleGroupItem>
                </ToggleGroup>
                <Label htmlFor="passport">{t(identityType === "resident" ? 'registration.emiratesId' : 'registration.passportNumber')} {identityType === "resident" ? `(${t('registration.optional')})` : "*"}</Label>
                <Input
                  id="passport"
                  type="text"
                  maxLength={identityType === "resident" ? 18 : 32}
                  dir="ltr"
                  placeholder={identityType === "resident" ? "784-XXXX-XXXXXXX-X" : t('registration.passportPlaceholder')}
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  required={identityType === "visitor"}
                  className="h-12"
                />
                <p className="text-sm text-muted-foreground">
                  {t('registration.passportHelper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('registration.email')} *</Label>
                <Input
                  maxLength={255}
                  autoComplete="email"
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
                <Label htmlFor="phone">{t('registration.phone')} ({t('registration.optional')})</Label>
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2" dir="ltr">
                <Select value={phoneCountry} onValueChange={(value) => { if (bookingCountries.includes(value as CountryCode)) setPhoneCountry(value as CountryCode); }}>
                  <SelectTrigger aria-label={t('registration.countryCode')} className="h-12">
                    <SelectValue><span className="flex items-center gap-2"><CountryFlag country={phoneCountry} /><span>+{getCountryCallingCode(phoneCountry)}</span></span></SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {countries.map((country) => <SelectItem key={country} value={country}><span className="flex items-center gap-2"><CountryFlag country={country} /><span>{countryNames.of(country) ?? country} (+{getCountryCallingCode(country)})</span></span></SelectItem>)}
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

              <Button type="submit" className="w-full h-12 text-base" size="lg" disabled={checkingAccount || sending}>
                {t(sending ? "bookingEmail.sending" : "registration.continueButton")}
              </Button>
            </form>
          </div>


        </div>
      </div>
    </div>
  );
};

export default Registration;
