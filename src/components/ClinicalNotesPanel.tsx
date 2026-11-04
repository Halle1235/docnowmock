import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Save, Trash2 } from "lucide-react";
import { doctorWorkspace, MEDICINE_OPTIONS, validPrescription, type DoctorVisit, type PrescriptionDraft } from "@/lib/doctor-workspace";
import { toast } from "sonner";

export default function ClinicalNotesPanel({ visit }: { visit: DoctorVisit }) {
  const [notes, setNotes] = useState(visit.notes);
  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>(visit.prescriptions);
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [dirty, setDirty] = useState(false);
  const draft = { medicine, dose, frequency, duration };
  const add = () => {
    if (!validPrescription(draft) || prescriptions.length >= 20) return;
    setPrescriptions([...prescriptions, draft]);
    setMedicine(""); setDose(""); setFrequency(""); setDuration(""); setDirty(true);
  };
  const save = () => {
    if (!doctorWorkspace.saveDraft(visit.id, notes, prescriptions)) { toast.error("Could not save this draft"); return; }
    setDirty(false); toast.success("Sample notes and prescription draft saved");
  };
  return (
    <section className="space-y-5 text-foreground bg-background p-4">
      <div><h2 className="text-lg font-semibold">Clinical notes</h2><p className="text-sm text-muted-foreground">{visit.name} · Sample only · Not a valid prescription</p></div>
      <div className="space-y-2"><Label htmlFor="clinical-notes">Consultation notes</Label><Textarea id="clinical-notes" rows={6} maxLength={10000} value={notes} onChange={e => { setNotes(e.target.value); setDirty(true); }} /><span className="text-xs text-muted-foreground">{notes.length}/10,000</span></div>
      <div className="space-y-3">
        <h3 className="font-semibold">Prescription draft</h3>
        <div className="space-y-1"><Label htmlFor="medicine">Medicine</Label><Input id="medicine" list="common-medicines" maxLength={200} value={medicine} onChange={e => setMedicine(e.target.value)} /><datalist id="common-medicines">{MEDICINE_OPTIONS.map(m => <option key={m} value={m} />)}</datalist></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="dose">Dose and unit</Label><Input id="dose" maxLength={200} value={dose} onChange={e => setDose(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="frequency">Frequency</Label><Input id="frequency" maxLength={200} value={frequency} onChange={e => setFrequency(e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="duration">Duration</Label><Input id="duration" maxLength={200} value={duration} onChange={e => setDuration(e.target.value)} /></div>
        <Button variant="outline" size="sm" disabled={!validPrescription(draft) || prescriptions.length >= 20} onClick={add}><Plus className="h-4 w-4 me-2" />Add medicine</Button>
        <ul className="divide-y">{prescriptions.map((p, i) => <li key={i} className="flex gap-2 py-3 items-start"><div className="flex-1 min-w-0 text-sm break-words"><strong>{p.medicine}</strong><p>{p.dose} · {p.frequency} · {p.duration}</p></div><Button variant="ghost" size="icon" aria-label={`Remove ${p.medicine}`} title="Remove medicine" onClick={() => { setPrescriptions(prescriptions.filter((_, index) => index !== i)); setDirty(true); }}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>
      </div>
      <Button onClick={save} disabled={!dirty || !!medicine || !!dose || !!frequency || !!duration} className="w-full"><Save className="h-4 w-4 me-2" />Save draft</Button>
      <p className="text-xs text-muted-foreground" role="status">{dirty ? "Unsaved changes" : "Saved draft"}{medicine || dose || frequency || duration ? " · Add or clear the medicine fields before saving" : ""}</p>
    </section>
  );
}