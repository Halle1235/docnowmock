import type { Json } from "@/integrations/supabase/types";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, FileText, Loader2, Save } from "lucide-react";

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
          {items.map((i, k) => (
            <li key={k}>{i}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
      {s.overview && (
        <div>
          <h4 className="font-semibold text-sm mb-1">Clinical Overview</h4>
          <p className="text-sm text-foreground whitespace-pre-wrap">{s.overview}</p>
        </div>
      )}
      {s.diagnosis && (
        <div>
          <h4 className="font-semibold text-sm mb-1">Diagnosis</h4>
          <p className="text-sm text-muted-foreground">{s.diagnosis}</p>
        </div>
      )}
      <List title="Treatment plan" items={s.treatment_plan} />
      {s.medications?.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-1">Medications & Prescriptions</h4>
          <ul className="text-sm space-y-1">
            {s.medications.map((m, k) => (
              <li key={k}>
                <span className="font-medium text-foreground">{m.name}</span>
                {m.instructions && <span className="text-muted-foreground"> — {m.instructions}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <List title="Self-care & Recommendations" items={s.self_care} />
      <List title="When to seek urgent care" items={s.warning_signs} />
      {s.follow_up && (
        <div>
          <h4 className="font-semibold text-sm mb-1">Follow-up</h4>
          <p className="text-sm text-muted-foreground">{s.follow_up}</p>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
        Doctor-approved clinical consultation summary. In a medical emergency call 998.
      </p>
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
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes || initialSummary?.overview || "");
  const [diagnosis, setDiagnosis] = useState(initialSummary?.diagnosis || "");
  const [treatmentPlan, setTreatmentPlan] = useState(initialSummary?.treatment_plan?.join("\n") || "");
  const [medications, setMedications] = useState(
    initialSummary?.medications?.map((m) => (m.instructions ? `${m.name} — ${m.instructions}` : m.name)).join("\n") ||
      "",
  );
  const [selfCare, setSelfCare] = useState(initialSummary?.self_care?.join("\n") || "");
  const [followUp, setFollowUp] = useState(initialSummary?.follow_up || "");

  const [summary, setSummary] = useState<VisitSummary | null>(initialSummary || null);
  const [approved, setApproved] = useState(!!initialSummary);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">(initialSummary ? "preview" : "edit");

  useEffect(() => {
    if (initialSummary) {
      setSummary(initialSummary);
      setApproved(true);
      setDiagnosis(initialSummary.diagnosis || "");
      setNotes(initialNotes || initialSummary.overview || "");
      setTreatmentPlan(initialSummary.treatment_plan?.join("\n") || "");
      setMedications(
        initialSummary.medications
          ?.map((m) => (m.instructions ? `${m.name} — ${m.instructions}` : m.name))
          .join("\n") || "",
      );
      setSelfCare(initialSummary.self_care?.join("\n") || "");
      setFollowUp(initialSummary.follow_up || "");
    }
  }, [initialSummary, initialNotes]);

  const saveSummary = async () => {
    if (!notes.trim()) {
      toast.error("Please provide consultation notes before saving.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const medList = medications
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((m) => {
          const parts = m.split("—");
          return {
            name: parts[0]?.trim() || m,
            instructions: parts[1]?.trim() || "As directed by attending physician",
          };
        });

      const summaryObj: VisitSummary = {
        overview: notes.trim(),
        diagnosis: diagnosis.trim() || "Clinical consultation completed",
        treatment_plan: treatmentPlan
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        medications: medList,
        self_care: selfCare
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        warning_signs: [
          "Seek emergency care immediately or call 998 if you develop chest pain, severe shortness of breath, sudden numbness, or rapid deterioration.",
        ],
        follow_up: followUp.trim() || "Follow up with a physician if symptoms do not improve as anticipated.",
      };

      const { error } = await supabase
        .from("consultations")
        .update({
          notes: notes.trim(),
          visit_summary: summaryObj as unknown as Json,
          visit_summary_approved_at: new Date().toISOString(),
          visit_summary_approved_by: user.id,
        })
        .eq("id", consultationId);

      if (error) throw error;

      // Automatically sync clinical findings to patient journal timeline
      if (notes.trim()) {
        try {
          const treatmentCombined = [
            treatmentPlan.trim() ? `Plan: ${treatmentPlan.trim()}` : "",
            medications.trim() ? `Medications: ${medications.trim()}` : "",
            selfCare.trim() ? `Self-care: ${selfCare.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");

          await supabase.rpc("add_patient_journal_entry", {
            _consultation_id: consultationId,
            _diagnosis: diagnosis.trim() || "Consultation Assessment",
            _treatment: treatmentCombined || "Standard care recommendations provided",
            _notes: notes.trim(),
          });
        } catch {
          // Journal entry sync failure should not block summary update
        }
      }

      setSummary(summaryObj);
      setApproved(true);
      setViewMode("preview");
      toast.success("Consultation summary saved and shared with the patient");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not save consultation summary");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <FileText className="h-3.5 w-3.5 text-primary" />
          {initialSummary ? "View summary" : "Notes & summary"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pe-6">
            <DialogTitle className="text-lg font-bold">Consultation Summary & Notes</DialogTitle>
            {approved ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[11px] flex items-center gap-1 font-medium">
                <CheckCircle className="h-3 w-3" />
                Approved & Shared
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[11px]">
                Draft
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs">
            Document your clinical findings, diagnosis, and patient instructions. Once saved, this summary is securely
            visible in the patient's portal.
          </DialogDescription>
        </DialogHeader>

        {/* View Switcher if summary exists */}
        {summary && (
          <div className="flex rounded-lg border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={`flex-1 rounded py-1 font-medium transition-colors ${viewMode === "edit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Edit Documentation
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`flex-1 rounded py-1 font-medium transition-colors ${viewMode === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Patient View Preview
            </button>
          </div>
        )}

        {viewMode === "preview" && summary ? (
          <div className="space-y-4">
            <SummaryView s={summary} />
            <Button variant="outline" onClick={() => setViewMode("edit")} className="w-full text-xs">
              Edit Summary Fields
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="summary-diag" className="text-xs font-semibold">
                Diagnosis / Clinical Findings
              </Label>
              <Input
                id="summary-diag"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Acute viral pharyngitis, Contact dermatitis"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-notes" className="text-xs font-semibold">
                Clinical Observations & Examination Notes *
              </Label>
              <Textarea
                id="summary-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                maxLength={10000}
                placeholder="Document clinical discussion, symptoms observed, vitals, and consultation review..."
                className="text-xs resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="summary-treatment" className="text-xs font-semibold">
                  Treatment & Prescriptions
                </Label>
                <Textarea
                  id="summary-treatment"
                  value={treatmentPlan}
                  onChange={(e) => setTreatmentPlan(e.target.value)}
                  rows={3}
                  placeholder="e.g. Fluids, warm saline gargle (one item per line)"
                  className="text-xs resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="summary-meds" className="text-xs font-semibold">
                  Medications & Dosages
                </Label>
                <Textarea
                  id="summary-meds"
                  value={medications}
                  onChange={(e) => setMedications(e.target.value)}
                  rows={3}
                  placeholder="e.g. Paracetamol 500mg — Take 1 tablet q6h prn"
                  className="text-xs resize-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-advice" className="text-xs font-semibold">
                Patient Self-Care & Recovery Guidance
              </Label>
              <Textarea
                id="summary-advice"
                value={selfCare}
                onChange={(e) => setSelfCare(e.target.value)}
                rows={2}
                placeholder="e.g. Adequate rest, hydrate with warm liquids, avoid cold irritants..."
                className="text-xs resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-followup" className="text-xs font-semibold">
                Follow-Up Guidance
              </Label>
              <Input
                id="summary-followup"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="e.g. Return for re-evaluation in 5 days if fever persists or symptoms worsen."
                className="text-xs"
              />
            </div>

            <Button
              onClick={saveSummary}
              disabled={saving || !notes.trim()}
              className="w-full gap-2 font-semibold shadow-sm text-xs mt-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {approved ? "Update & Save Consultation Summary" : "Save & Share Summary with Patient"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default VisitSummaryDialog;
