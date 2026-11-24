import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { submitVisitFeedback } from "@/lib/visit-feedback";

export default function VisitFeedbackCard({ visitId, submitted, onSubmitted }: {
  visitId: string; submitted: boolean; onSubmitted: () => void;
}) {
  const { t } = useTranslation();
  const [doctorRating, setDoctorRating] = useState(0);
  const [videoRating, setVideoRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  if (submitted) return <p className="rounded-lg border bg-muted/30 p-3 text-sm" role="status">{t("feedback.thanks")}</p>;

  const ratingRow = (label: string, value: number, set: (rating: number) => void) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map(rating => <Button key={rating} type="button" size="sm"
          variant={value === rating ? "default" : "outline"} aria-pressed={value === rating}
          aria-label={t("feedback.ratingLabel", { count: rating })} disabled={saving}
          onClick={() => set(rating)}>{rating}</Button>)}
      </div>
    </div>
  );

  const save = async () => {
    if (inFlight.current || !doctorRating || !videoRating) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await submitVisitFeedback(visitId, doctorRating, videoRating, comment.trim());
      onSubmitted();
      toast.success(t("feedback.thanks"));
    } catch {
      toast.error(t("feedback.error"));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <section aria-label={t("feedback.title")} className="space-y-4 rounded-xl border bg-muted/20 p-4">
    <div><h3 className="font-semibold">{t("feedback.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("feedback.privateHint")}</p></div>
    {ratingRow(t("feedback.doctor"), doctorRating, setDoctorRating)}
    {ratingRow(t("feedback.video"), videoRating, setVideoRating)}
    <div className="space-y-2"><Label htmlFor={`feedback-${visitId}`}>{t("feedback.comment")}</Label>
      <Textarea id={`feedback-${visitId}`} maxLength={500} value={comment} disabled={saving}
        onChange={event => setComment(event.target.value)} placeholder={t("feedback.commentHint")} /></div>
    <Button type="button" size="sm" disabled={!doctorRating || !videoRating || saving} onClick={() => void save()}>
      {t(saving ? "feedback.saving" : "feedback.submit")}
    </Button>
  </section>;
}
