import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, FileText, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface VisitSummary {
  overview: string;
  diagnosis: string;
  treatment_plan: string[];
  medications: { name: string; instructions: string }[];
  self_care: string[];
  warning_signs: string[];
  follow_up: string;
}

export const SummaryView = ({ s }: { s: VisitSummary }) => {
  const List = ({ title, items }: { title: string; items: string[] }) =>
    items?.length ? (
      <div>
        <h4 className="font-semibold text-sm mb-1">{title}</h4>
        <ul className="list-disc ps-5 text-sm text-muted-foreground space-y-1">
          {items.map((i, k) => <li key={k}>{i}</li>)}
        </ul>
      </div>
    ) : null;
  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm">{s.overview}</p>
      <div>
        <h4 className="font-semibold text-sm mb-1">Diagnosis</h4>
        <p className="text-sm text-muted-foreground">{s.diagnosis}</p>
      </div>
      <List title="Treatment plan" items={s.treatment_plan} />
      {s.medications?.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-1">Medications</h4>
          <ul className="text-sm space-y-1">
            {s.medications.map((m, k) => (
              <li key={k}><span className="font-medium">{m.name}</span> — <span className="text-muted-foreground">{m.instructions}</span></li>
            ))}
          </ul>
        </div>
      )}
      <List title="Self-care" items={s.self_care} />
      <List title="When to seek urgent care" items={s.warning_signs} />
      <div>
        <h4 className="font-semibold text-sm mb-1">Follow-up</h4>
        <p className="text-sm text-muted-foreground">{s.follow_up}</p>
      </div>
      <p className="text-xs text-muted-foreground">AI-generated from your doctor's notes. In an emergency call 998.</p>
    </div>
  );
};

interface Props {
  consultationId: string;
  initialNotes?: string | null;
  initialSummary?: VisitSummary | null;
  onSaved?: () => void;
}

const VisitSummaryDialog = ({ consultationId, initialNotes, initialSummary, onSaved }: Props) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes || "");
  const [summary, setSummary] = useState<VisitSummary | null>(initialSummary || null);
  const [approved, setApproved] = useState(!!initialSummary);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("visit_summary_drafts").select("summary").eq("consultation_id", consultationId).maybeSingle()
      .then(({ data }) => {
        if (data?.summary) { setSummary(data.summary as unknown as VisitSummary); setApproved(false); }
      });
  }, [open, consultationId]);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("generate-visit-summary", { body });
    if (error) {
      let msg = error.message;
      try { msg = (await (error as any).context?.json())?.error || msg; } catch {}
      throw new Error(msg);
    }
    return data;
  };

  const generate = async () => {
    setLoading(true);
    try {
      const data = await call({ consultationId, notes, language: i18n.language?.startsWith("ar") ? "ar" : "en" });
      setSummary(data.summary);
      setApproved(false);
      toast.success("Draft ready — review it, then approve to share with the patient");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not create summary");
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    setApproving(true);
    try {
      await call({ consultationId, action: "approve" });
      setApproved(true);
      toast.success("Summary approved and shared with the patient");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not approve summary");
    } finally {
      setApproving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 me-2" />
          {initialSummary ? "View / edit summary" : "Notes & summary"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consultation notes</DialogTitle>
          <DialogDescription>Write your clinical notes. AI drafts a patient summary; you review and approve it before the patient can see it.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          maxLength={10000}
          placeholder="e.g. 3 days sore throat, no fever. Exam: mild pharyngeal redness. Dx: viral pharyngitis. Plan: fluids, paracetamol 500mg q6h prn, review in 5 days if not improving…"
        />
        <Button onClick={generate} disabled={loading || notes.trim().length < 10}>
          {loading ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Sparkles className="h-4 w-4 me-2" />}
          {loading ? "Generating…" : summary ? "Regenerate draft" : "Generate draft summary"}
        </Button>
        {summary && (
          <div className="space-y-3">
            <Badge variant={approved ? "default" : "outline"}>
              {approved ? "Approved — visible to patient" : "Draft — awaiting your review (not visible to patient)"}
            </Badge>
            <SummaryView s={summary} />
            {!approved && (
              <Button onClick={approve} disabled={approving} className="w-full">
                {approving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <CheckCircle className="h-4 w-4 me-2" />}
                I have reviewed this — approve & share with patient
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default VisitSummaryDialog;
