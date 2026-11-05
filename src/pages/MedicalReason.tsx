import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useBookingDraft } from "@/components/BookingDraftProvider";
import { reasonSchema } from "@/lib/booking-intake";

const MedicalReason = () => {
  const navigate = useNavigate();
  const { intake, reason, setReason } = useBookingDraft();
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string>(reason?.category ?? "");
  const [description, setDescription] = useState(reason?.description ?? "");
  const [ackEmergency, setAckEmergency] = useState(reason?.emergency ?? false);
  const [ackTelehealth, setAckTelehealth] = useState(reason?.telehealth ?? false);
  const [ackPrivacy, setAckPrivacy] = useState(reason?.privacy ?? false);

  const categories = [
    { id: "urgent-gp", label: t("medicalReason.categories.urgentGp") },
    { id: "skin", label: t("medicalReason.categories.skin") },
    { id: "respiratory", label: t("medicalReason.categories.respiratory") },
    { id: "digestive", label: t("medicalReason.categories.digestive") },
    { id: "mental", label: t("medicalReason.categories.mental") },
    { id: "urinary", label: t("medicalReason.categories.urinary") },
    { id: "pain", label: t("medicalReason.categories.pain") },
    { id: "allergies", label: t("medicalReason.categories.allergies") },
    { id: "sexual", label: t("medicalReason.categories.sexual") },
    { id: "womens", label: t("medicalReason.categories.womens") },
    { id: "children", label: t("medicalReason.categories.children") },
    { id: "general", label: t("medicalReason.categories.general") },
  ];

  const handleSubmit = () => {
    if (!selectedCategory) {
      toast.error(t("medicalReason.selectCategory"));
      return;
    }

    if (!description.trim()) {
      toast.error(t("medicalReason.provideDescription"));
      return;
    }

    if (!ackEmergency || !ackTelehealth || !ackPrivacy) {
      toast.error(t("medicalReason.consentRequired"));
      return;
    }
    const result = reasonSchema.safeParse({
      category: selectedCategory,
      description,
      emergency: ackEmergency,
      telehealth: ackTelehealth,
      privacy: ackPrivacy,
    });
    if (!result.success) {
      toast.error(t("medicalReason.invalidDescription"));
      return;
    }
    setReason(result.data);

    navigate("/payment");
  };

  if (!intake) return <Navigate to="/registration" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">{t("header.brand")}</h1>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">{t("medicalReason.title")}</h2>
            <p className="text-muted-foreground">{t("medicalReason.subtitle")}</p>
          </div>

          <section className="space-y-6">
            <div role="alert" className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">{t("medicalReason.emergencyTitle")}</p>
                <p className="text-sm text-foreground">{t("medicalReason.emergencyText")}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  className="h-auto py-4 text-left justify-start"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.label}
                </Button>
              ))}
            </div>

            {selectedCategory && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label htmlFor="description">{t("medicalReason.descriptionLabel")}</Label>
                <Textarea
                  maxLength={2000}
                  id="description"
                  placeholder={t("medicalReason.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[150px]"
                />
              </div>
            )}

            <div className="space-y-3">
              {[
                { id: "ack-emergency", v: ackEmergency, set: setAckEmergency, k: "ackEmergency" },
                { id: "ack-telehealth", v: ackTelehealth, set: setAckTelehealth, k: "ackTelehealth" },
                { id: "ack-privacy", v: ackPrivacy, set: setAckPrivacy, k: "ackPrivacy" },
              ].map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <Checkbox id={c.id} checked={c.v} onCheckedChange={(x) => c.set(x === true)} className="mt-0.5" />
                  <Label htmlFor={c.id} className="text-sm font-normal leading-snug">
                    {t(`medicalReason.${c.k}`)}
                  </Label>
                </div>
              ))}
            </div>

            <Button variant="ghost" onClick={() => navigate("/registration")}>
              {t("registration.backToIntake")}
            </Button>
            <Button onClick={handleSubmit} className="w-full" size="lg">
              {t("medicalReason.continueButton")}
            </Button>
          </section>
        </div>
      </main>
    </div>
  );
};

export default MedicalReason;
