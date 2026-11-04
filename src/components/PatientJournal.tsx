import { useEffect, useState } from "react";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { MOCK_LOGIN_ENABLED } from "@/lib/mock-login";
import { doctorWorkspace } from "@/lib/doctor-workspace";
import { useSampleJournal, validJournalEntry, type JournalEntry } from "@/lib/patient-journal";
import { toast } from "sonner";

interface Props { consultationId: string; patientId?: string; patientName?: string; sample?: boolean; canAdd?: boolean }
export default function PatientJournal({ consultationId, patientId, patientName, sample = false, canAdd = false }: Props) {
  const sampleEntries = useSampleJournal();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [identity, setIdentity] = useState({ id: "", name: "" });
  const [loading, setLoading] = useState(!sample);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [notes, setNotes] = useState("");
  const load = async (before?: string) => {
    if (sample || MOCK_LOGIN_ENABLED) return;
    setLoading(true); setError(false);
    const { data, error: failure } = await supabase.rpc("list_patient_journal", { _consultation_id: consultationId, ...(before ? { _before: before } : {}) });
    if (failure || !data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.entries)) { setError(true); setLoading(false); return; }
    const result = data.entries as unknown as JournalEntry[];
    setIdentity({ id: String(data.patient_id), name: String(data.patient_name || "Patient") });
    setEntries(previous => before ? [...previous, ...result] : result);
    setMore(result.length === 50); setLoading(false);
  };
  useEffect(() => { void load(); }, [consultationId, sample]);
  const visible = sample ? sampleEntries.filter(e => e.patient_id === patientId) : entries;
  const add = async () => {
    if (saving || !canAdd || !validJournalEntry(diagnosis, treatment, notes)) return;
    setSaving(true);
    if (sample) {
      if (!doctorWorkspace.addJournalEntry(consultationId, diagnosis, treatment, notes)) { toast.error("Could not add journal entry"); setSaving(false); return; }
    } else {
      if (MOCK_LOGIN_ENABLED) { setSaving(false); return; }
      const { error: failure } = await supabase.rpc("add_patient_journal_entry", { _consultation_id: consultationId, _diagnosis: diagnosis, _treatment: treatment, _notes: notes });
      if (failure) { toast.error("Journal entry could not be saved. Your notes are still here."); setSaving(false); return; }
      await load();
    }
    setDiagnosis(""); setTreatment(""); setNotes(""); setSaving(false); toast.success(sample ? "Sample journal entry added" : "Journal entry saved");
  };
  return <section className="border-t pt-5 space-y-5 text-foreground" aria-label="Patient journal">
    <header><h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5 text-primary" />Patient journal</h2><p className="mt-1 text-sm font-medium break-words">{sample ? patientName : identity.name}</p><p className="text-xs text-muted-foreground break-all">Patient ID: {sample ? patientId : identity.id}{sample ? " · Sample only · Resets on refresh" : ""}</p></header>
    {error ? <div role="alert" className="space-y-2"><p className="text-sm text-destructive">Journal unavailable. Access requires an authorized patient visit.</p><Button variant="outline" onClick={() => void load()}>Retry</Button></div> : <>
      {loading && <p role="status" className="flex gap-2 items-center text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading journal…</p>}
      <ol className="border-s-2 border-primary/20 ms-2 space-y-6">{visible.map(entry => <li key={entry.id} className="relative ps-5"><span className="absolute -start-1.5 top-1 h-2.5 w-2.5 rounded-full bg-primary" /><time className="text-xs font-medium text-primary">{new Date(entry.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time><h3 className="mt-1 font-semibold text-sm break-words">{entry.doctor_name}</h3><p className="text-xs text-muted-foreground break-words">{entry.license_number}</p><dl className="mt-3 space-y-2 text-sm">{entry.diagnosis && <div><dt className="font-medium">Diagnosis</dt><dd className="whitespace-pre-wrap break-words">{entry.diagnosis}</dd></div>}{entry.treatment && <div><dt className="font-medium">Treatment recorded</dt><dd className="whitespace-pre-wrap break-words">{entry.treatment}</dd></div>}<div><dt className="font-medium">Clinical notes</dt><dd className="whitespace-pre-wrap break-words">{entry.notes}</dd></div></dl></li>)}</ol>
      {!loading && !visible.length && <p className="text-sm text-muted-foreground">No journal entries yet</p>}
      {!sample && more && <Button variant="outline" disabled={loading} onClick={() => void load(entries[entries.length - 1]?.created_at)}>Older entries</Button>}
      {canAdd && <form className="space-y-3 border-t pt-4" onSubmit={event => { event.preventDefault(); void add(); }}><h3 className="font-semibold">New journal entry</h3><div className="space-y-1"><Label htmlFor={`journal-diagnosis-${consultationId}`}>Diagnosis</Label><Input id={`journal-diagnosis-${consultationId}`} maxLength={1000} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} disabled={saving} /></div><div className="space-y-1"><Label htmlFor={`journal-treatment-${consultationId}`}>Treatment recorded</Label><Textarea id={`journal-treatment-${consultationId}`} rows={2} maxLength={4000} value={treatment} onChange={e => setTreatment(e.target.value)} disabled={saving} /></div><div className="space-y-1"><Label htmlFor={`journal-notes-${consultationId}`}>Journal clinical notes</Label><Textarea id={`journal-notes-${consultationId}`} rows={4} maxLength={10000} value={notes} onChange={e => setNotes(e.target.value)} disabled={saving} required /></div><Button type="submit" disabled={saving || loading || !validJournalEntry(diagnosis, treatment, notes)}><Plus className="h-4 w-4 me-2" />{saving ? "Saving…" : "Add journal entry"}</Button></form>}
    </>}
  </section>;
}