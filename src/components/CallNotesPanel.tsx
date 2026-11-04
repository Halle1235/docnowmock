import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { COMMON_MEDICINES } from "@/lib/doctor-tools";

interface Props {
  /** Real consultation id, or null in demo mode (nothing is saved). */
  consultationId: string | null;
}

interface Item { name: string; dose: string }

const toText = (items: Item[]) =>
  items.filter((i) => i.name.trim()).map((i) => `${i.name.trim()} — ${i.dose.trim()}`).join("\n");

const CallNotesPanel = ({ consultationId }: Props) => {
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!consultationId) return;
    supabase.from("consultations").select("notes, prescription").eq("id", consultationId).maybeSingle()
      .then(({ data }) => {
        if (data?.notes) setNotes(data.notes);
        if (data?.prescription) {
          setItems(data.prescription.split("\n").filter(Boolean).map((l) => {
            const [name, ...rest] = l.split(" — ");
            return { name, dose: rest.join(" — ") };
          }));
        }
      });
  }, [consultationId]);

  const addMedicine = (name: string) => {
    const m = COMMON_MEDICINES.find((x) => x.name === name);
    if (m) setItems((xs) => [...xs, { name: m.name, dose: m.dose }]);
  };

  const save = async () => {
    const prescription = toText(items);
    if (prescription && !ack) {
      toast.error("Confirm the prescription has no controlled medicines.");
      return;
    }
    if (notes.length > 5000 || prescription.length > 2000) {
      toast.error("Notes or prescription are too long.");
      return;
    }
    if (!consultationId) {
      toast.success("Saved for this demo call only");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("consultations").update({
      notes: notes.trim() || null,
      prescription: prescription || null,
      prescription_no_controlled_ack: prescription ? ack : false,
    }).eq("id", consultationId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Notes saved");
  };

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto border-s bg-card p-4">
      <div className="space-y-2">
        <Label htmlFor="call-notes">Notes</Label>
        <Textarea id="call-notes" rows={8} maxLength={5000} value={notes}
          onChange={(e) => setNotes(e.target.value)} placeholder="Symptoms, findings, advice…" />
      </div>

      <div className="space-y-2">
        <Label>Prescription</Label>
        <Select value="" onValueChange={addMedicine}>
          <SelectTrigger><SelectValue placeholder="Add a common medicine" /></SelectTrigger>
          <SelectContent>
            {COMMON_MEDICINES.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {items.map((it, i) => (
          <div key={i} className="space-y-1 rounded-md border p-2">
            <div className="flex gap-2">
              <Input value={it.name} maxLength={120} aria-label="Medicine"
                onChange={(e) => setItems((xs) => xs.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} />
              <Button variant="ghost" size="icon" aria-label="Remove medicine"
                onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Input value={it.dose} maxLength={200} aria-label="Dose"
              onChange={(e) => setItems((xs) => xs.map((x, k) => k === i ? { ...x, dose: e.target.value } : x))} />
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setItems((xs) => [...xs, { name: "", dose: "" }])}>
          <Plus className="me-2 h-4 w-4" />Add other medicine
        </Button>
        {items.length > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            No narcotic, controlled or semi-controlled medicines
          </label>
        )}
      </div>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save notes"}</Button>
      {!consultationId && <p className="text-xs text-muted-foreground">Demo call: notes are not stored.</p>}
    </aside>
  );
};

export default CallNotesPanel;
