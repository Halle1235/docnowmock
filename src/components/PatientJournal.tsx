import { useEffect, useState } from "react";
import { BookOpen, FileText, History, Loader2, Plus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { validJournalEntry, type JournalEntry } from "@/lib/patient-journal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  consultationId: string;
  canAdd?: boolean;
  variant?: "default" | "room";
  visitReason?: string;
  patientName?: string;
  filterConsultationId?: string | null;
  visitsList?: Array<{ id: string; reason_category?: string | null; created_at?: string | null }>;
  hideHeader?: boolean;
  onClearFilter?: () => void;
}

export default function PatientJournal({
  consultationId,
  canAdd = false,
  variant = "default",
  visitReason,
  patientName,
  filterConsultationId,
  visitsList,
  hideHeader = false,
  onClearFilter,
}: Props) {
  const isRoom = variant === "room";
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [identity, setIdentity] = useState({ id: "", name: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [activeTab, setActiveTab] = useState<"write" | "history">(canAdd ? "write" : "history");

  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [notes, setNotes] = useState("");

  const displayedEntries =
    filterConsultationId && filterConsultationId !== "all"
      ? entries.filter((e) => e.consultation_id === filterConsultationId)
      : entries;

  const load = async (before?: string) => {
    setLoading(true);
    setError(false);
    const { data, error: failure } = await supabase.rpc("list_patient_journal", {
      _consultation_id: consultationId,
      ...(before ? { _before: before } : {}),
    });
    if (failure || !data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.entries)) {
      setError(true);
      setLoading(false);
      return;
    }
    const result = data.entries as unknown as JournalEntry[];
    setIdentity({ id: String(data.patient_id), name: String(data.patient_name || patientName || "Patient") });
    setEntries((previous) => (before ? [...previous, ...result] : result));
    setMore(result.length === 50);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [consultationId]);

  const add = async () => {
    if (saving || !canAdd || !validJournalEntry(diagnosis, treatment, notes)) return;
    setSaving(true);
    const { error: failure } = await supabase.rpc("add_patient_journal_entry", {
      _consultation_id: consultationId,
      _diagnosis: diagnosis,
      _treatment: treatment,
      _notes: notes,
    });
    if (failure) {
      toast.error("Journal entry could not be saved. Your notes are still here.");
      setSaving(false);
      return;
    }
    await load();
    setDiagnosis("");
    setTreatment("");
    setNotes("");
    setSaving(false);
    toast.success("Clinical note saved to patient journal");
    setActiveTab("history");
  };

  if (isRoom) {
    return (
      <section className="flex h-full min-h-0 flex-col text-white/95" aria-label="Clinical notes">
        {/* Header */}
        <div className="border-b border-white/10 p-4 pe-12">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Clinical Notes & Journal</h2>
              <p className="text-[11px] text-white/60">
                {identity.name || patientName || "Patient record"}
                {identity.id ? ` · ID: ${identity.id.slice(0, 8)}…` : ""}
              </p>
            </div>
          </div>

          {/* Reason for visit card */}
          {visitReason && (
            <div className="mt-3 rounded-xl border border-white/10 bg-room-card p-2.5">
              <span className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">Reason for visit</span>
              <p className="mt-0.5 text-xs text-white/90 break-words">{visitReason}</p>
            </div>
          )}

          {/* Tab Switcher */}
          {canAdd && (
            <div className="mt-3 flex rounded-xl border border-white/10 bg-room-card p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("write")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-colors",
                  activeTab === "write" ? "bg-white text-room-ink shadow" : "text-white/70 hover:text-white",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                New Note
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-colors",
                  activeTab === "history" ? "bg-white text-room-ink shadow" : "text-white/70 hover:text-white",
                )}
              >
                <History className="h-3.5 w-3.5" />
                History ({entries.length})
              </button>
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground"
            >
              <p>Journal access requires an active assigned consultation.</p>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : activeTab === "write" ? (
            <form
              className="space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor={`room-diag-${consultationId}`} className="text-xs text-white/80">
                  Diagnosis
                </Label>
                <Input
                  id={`room-diag-${consultationId}`}
                  maxLength={1000}
                  placeholder="e.g. Acute pharyngitis, Contact dermatitis"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  disabled={saving}
                  className="rounded-xl border-white/15 bg-room-card text-xs text-white placeholder:text-white/35 focus-visible:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`room-treat-${consultationId}`} className="text-xs text-white/80">
                  Treatment & Recommendation
                </Label>
                <Textarea
                  id={`room-treat-${consultationId}`}
                  rows={2}
                  maxLength={4000}
                  placeholder="Prescribed rest, fluids, topical hydrocortisone..."
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                  disabled={saving}
                  className="rounded-xl border-white/15 bg-room-card text-xs text-white placeholder:text-white/35 focus-visible:ring-primary resize-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`room-notes-${consultationId}`} className="text-xs text-white/80">
                  Clinical Observations *
                </Label>
                <Textarea
                  id={`room-notes-${consultationId}`}
                  rows={4}
                  maxLength={10000}
                  placeholder="Patient presented with 3-day history of... Vitals stable, throat erythematous..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={saving}
                  required
                  className="rounded-xl border-white/15 bg-room-card text-xs text-white placeholder:text-white/35 focus-visible:ring-primary resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={saving || loading || !validJournalEntry(diagnosis, treatment, notes)}
                className="w-full gap-2 rounded-xl text-xs font-semibold shadow-md"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {saving ? "Saving to journal…" : "Save Journal Entry"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {loading && (
                <p role="status" className="flex items-center gap-2 text-xs text-white/60">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading history…
                </p>
              )}
              {!loading && !displayedEntries.length && (
                <div className="rounded-xl border border-white/10 bg-room-card p-6 text-center text-xs text-white/60">
                  <BookOpen className="mx-auto mb-2 h-6 w-6 text-white/40" />
                  {entries.length > 0
                    ? "No notes recorded for this visit (other visit notes are available)."
                    : "No previous journal entries on record for this patient."}
                </div>
              )}
              <div className="space-y-3">
                {displayedEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/10 bg-room-card p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-semibold text-white/90">{entry.doctor_name}</span>
                      <time className="text-[10px] text-white/50">
                        {new Date(entry.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    {entry.diagnosis && (
                      <div>
                        <span className="text-[10px] font-semibold text-white/50 uppercase">Diagnosis</span>
                        <p className="text-white/90 whitespace-pre-wrap">{entry.diagnosis}</p>
                      </div>
                    )}
                    {entry.treatment && (
                      <div>
                        <span className="text-[10px] font-semibold text-white/50 uppercase">Treatment</span>
                        <p className="text-white/90 whitespace-pre-wrap">{entry.treatment}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] font-semibold text-white/50 uppercase">Notes</span>
                      <p className="text-white/80 whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
              {more && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void load(entries[entries.length - 1]?.created_at)}
                  className="w-full text-xs"
                >
                  Older entries
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={cn("space-y-5 text-foreground", !hideHeader && "border-t pt-5")} aria-label="Patient journal">
      {!hideHeader && (
        <header>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-5 w-5 text-primary" />
            Patient journal
          </h2>
          <p className="mt-1 text-sm font-medium break-words">{identity.name || patientName || "Patient"}</p>
          {identity.id && <p className="text-xs text-muted-foreground break-all">Patient ID: {identity.id}</p>}
        </header>
      )}

      {error ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">Journal unavailable. Access requires an authorized patient visit.</p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {loading && (
            <p role="status" className="flex gap-2 items-center text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading journal…
            </p>
          )}
          <ol className="border-s-2 border-primary/20 ms-2 space-y-6">
            {displayedEntries.map((entry) => {
              const matchedVisit = visitsList?.find((v) => v.id === entry.consultation_id);
              return (
                <li key={entry.id} className="relative ps-6">
                  <span className="absolute -start-1.5 top-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                  <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Stethoscope className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm leading-tight text-foreground">{entry.doctor_name}</h3>
                          {entry.license_number && (
                            <p className="text-[11px] text-muted-foreground">Licence: {entry.license_number}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {matchedVisit && (
                          <Badge
                            variant="outline"
                            className="text-[11px] font-normal border-primary/20 text-primary bg-primary/5"
                          >
                            {matchedVisit.reason_category || "Consultation"}
                          </Badge>
                        )}
                        <time className="text-xs text-muted-foreground font-medium">
                          {new Date(entry.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </time>
                      </div>
                    </div>

                    <dl className="space-y-3 text-xs sm:text-sm">
                      {entry.diagnosis && (
                        <div>
                          <dt className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                            Diagnosis
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap font-medium text-foreground">{entry.diagnosis}</dd>
                        </div>
                      )}
                      {entry.treatment && (
                        <div>
                          <dt className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                            Treatment & Prescribed Plan
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap text-foreground">{entry.treatment}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                          Clinical Notes & Observations
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-muted-foreground leading-relaxed">
                          {entry.notes}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </li>
              );
            })}
          </ol>
          {!loading && !displayedEntries.length && (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-xs space-y-2">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40 mb-1" />
              <p className="font-semibold text-sm text-foreground">
                {filterConsultationId && filterConsultationId !== "all"
                  ? "No journal entries for this visit"
                  : "No journal entries yet"}
              </p>
              <p className="max-w-md mx-auto">
                {filterConsultationId && filterConsultationId !== "all"
                  ? entries.length > 0
                    ? `There are ${entries.length} record${entries.length > 1 ? "s" : ""} from other visits available in your complete history.`
                    : "Your attending physician has not recorded any journal notes for this consultation."
                  : "Your physician's clinical notes, diagnosis, and treatment plan will appear here after your consultation."}
              </p>
              {filterConsultationId && filterConsultationId !== "all" && entries.length > 0 && onClearFilter && (
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={onClearFilter} className="text-xs gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-primary" />
                    Show all my {entries.length} records
                  </Button>
                </div>
              )}
            </div>
          )}
          {more && (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load(entries[entries.length - 1]?.created_at)}
            >
              Older entries
            </Button>
          )}
          {canAdd && (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <h3 className="font-semibold">New journal entry</h3>
              <div className="space-y-1">
                <Label htmlFor={`journal-diagnosis-${consultationId}`}>Diagnosis</Label>
                <Input
                  id={`journal-diagnosis-${consultationId}`}
                  maxLength={1000}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`journal-treatment-${consultationId}`}>Treatment recorded</Label>
                <Textarea
                  id={`journal-treatment-${consultationId}`}
                  rows={2}
                  maxLength={4000}
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`journal-notes-${consultationId}`}>Journal clinical notes</Label>
                <Textarea
                  id={`journal-notes-${consultationId}`}
                  rows={4}
                  maxLength={10000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>
              <Button type="submit" disabled={saving || loading || !validJournalEntry(diagnosis, treatment, notes)}>
                <Plus className="h-4 w-4 me-2" />
                {saving ? "Saving…" : "Add journal entry"}
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
