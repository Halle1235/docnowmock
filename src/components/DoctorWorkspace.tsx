import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Bell, BellOff, Clock, FileText, LogOut, Plus, Search, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PatientJournal from "@/components/PatientJournal";
import ClinicalNotesPanel from "@/components/ClinicalNotesPanel";
import { dailyStats, doctorWorkspace, isLongWait, patientAge, searchHistory, useDoctorWorkspace, waitMinutes, type DoctorVisit } from "@/lib/doctor-workspace";
import { demoCallPath } from "@/lib/mock-login";
import { usePatientWorkspace } from "@/lib/patient-workspace";

export default function DoctorWorkspace() {
  const navigate = useNavigate();
  const state = useDoctorWorkspace();
  const patient = usePatientWorkspace();
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [arrival, setArrival] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef(new Set(state.visits.map(v => v.id)));
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const newVisits = state.visits.filter(v => v.status === "pending" && !seen.current.has(v.id));
    seen.current = new Set(state.visits.map(v => v.id));
    if (!newVisits.length) return;
    setArrival(`${newVisits.length} new patient${newVisits.length > 1 ? "s" : ""} in the queue`);
    if (!state.sound || !audio.current || audio.current.state !== "running") return;
    const oscillator = audio.current.createOscillator();
    const gain = audio.current.createGain();
    oscillator.connect(gain); gain.connect(audio.current.destination);
    oscillator.frequency.value = 660; gain.gain.value = 0.07;
    oscillator.start(); oscillator.stop(audio.current.currentTime + 0.2);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }, [state.visits, state.sound]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const toggleSound = async () => {
    if (state.sound) { doctorWorkspace.setSound(false); return; }
    try { audio.current ??= new AudioContext(); await audio.current.resume(); doctorWorkspace.setSound(audio.current.state === "running"); } catch { setArrival("Sound is unavailable in this browser"); }
  };
  const stats = dailyStats(state.visits, new Date(now));
  const pending = state.visits.filter(v => v.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
  const active = state.visits.filter(v => v.status === "claimed" || v.status === "in_progress");
  const history = searchHistory(state.visits, search);
  const selected = state.visits.find(v => v.id === selectedId);
  const details = (v: DoctorVisit) => <div className="space-y-2 text-sm break-words"><p><span className="font-medium">Reason:</span> {v.reason}</p><p><span className="font-medium">Symptoms:</span> {v.symptoms}</p><div className="flex flex-wrap gap-x-6 gap-y-1"><p><span className="font-medium">Age:</span> {patientAge(v.dateOfBirth) ?? "Not reported"}</p><p><span className="font-medium">Allergies:</span> {v.id === "sample-1" ? patient.profile.allergies || "Not reported" : v.allergies || "Not reported"}</p></div>{v.id === "sample-1" && <><p><span className="font-medium">Current medicines:</span> {patient.profile.medicines || "Not reported"}</p><p><span className="font-medium">Long-term conditions:</span> {patient.profile.conditions || "Not reported"}</p></>}</div>;
  const visitCard = (v: DoctorVisit) => <Card key={v.id} className={`p-5 rounded-lg space-y-4 ${v.status === "pending" && isLongWait(v, now) ? "border-destructive" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{v.name}</h3><Badge variant={v.status === "pending" && isLongWait(v, now) ? "destructive" : "outline"}>{v.status === "pending" ? `Waiting ${waitMinutes(v, now)} min` : v.status === "in_progress" ? "In call" : "Assigned"}</Badge></div>
    {details(v)}
    <div className="flex flex-wrap justify-between items-center gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>{v.status === "pending" ? <Button disabled={!state.available} onClick={() => doctorWorkspace.claim(v.id)}>Take consultation</Button> : <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelectedId(v.id)}><FileText className="h-4 w-4 me-2" />Notes & prescription</Button><Button onClick={() => navigate(`${demoCallPath("doctor")}&visit=${encodeURIComponent(v.id)}`)}><Video className="h-4 w-4 me-2" />{v.status === "in_progress" ? "Return to call" : "Start video"}</Button></div>}</div>
  </Card>;
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card"><div className="container px-4 py-4 flex flex-wrap justify-between items-center gap-3"><h1 className="text-2xl font-bold text-primary">DocNow · Doctors</h1><div className="flex items-center gap-2"><LanguageSwitcher /><Button variant="ghost" size="sm" onClick={() => navigate("/auth")}><LogOut className="h-4 w-4 me-2" />Log out</Button></div></div></header>
    <main className="container max-w-6xl px-4 py-8 space-y-7">
      <div className="flex flex-wrap justify-between items-start gap-4"><div><h2 className="text-3xl font-bold">Doctor dashboard</h2><p className="text-sm text-muted-foreground mt-2">Sample mode · Fictional patients · Drafts reset on refresh</p></div><div className="flex items-center gap-3"><label htmlFor="doctor-available" className="font-medium">{state.available ? "Online" : "Offline"}</label><Switch id="doctor-available" checked={state.available} onCheckedChange={doctorWorkspace.setAvailable} aria-label="Doctor online" /></div></div>
      <section aria-label="Daily statistics" className="grid grid-cols-2 md:grid-cols-4 gap-5 border-y py-5"><div><p className="text-sm text-muted-foreground">Completed today</p><p className="text-3xl font-semibold mt-2">{stats.completed}</p></div><div><p className="text-sm text-muted-foreground">Average call length</p><p className="text-3xl font-semibold mt-2">{stats.averageSeconds === null ? "—" : `${Math.floor(stats.averageSeconds / 60)}:${String(stats.averageSeconds % 60).padStart(2, "0")}`}</p></div><div><p className="text-sm text-muted-foreground">Waiting</p><p className="text-3xl font-semibold mt-2">{pending.length}</p></div><div><p className="text-sm text-muted-foreground">Waiting 5+ minutes</p><p className="text-3xl font-semibold mt-2 text-destructive">{pending.filter(v => isLongWait(v, now)).length}</p></div></section>
      <Tabs defaultValue="queue"><div className="flex flex-wrap items-center justify-between gap-3"><TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="queue"><Clock className="h-4 w-4 me-2" />Queue</TabsTrigger><TabsTrigger value="active"><Activity className="h-4 w-4 me-2" />My consultations</TabsTrigger><TabsTrigger value="history"><FileText className="h-4 w-4 me-2" />History</TabsTrigger></TabsList><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={state.sound ? "Mute queue sound" : "Enable queue sound"} title={state.sound ? "Mute queue sound" : "Enable queue sound"} aria-pressed={state.sound} onClick={toggleSound}>{state.sound ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}</Button><Button variant="outline" disabled={!state.available} onClick={doctorWorkspace.addSamplePatient}><Plus className="h-4 w-4 me-2" />Add sample patient</Button></div></div>
      <p className="text-sm text-primary mt-3 min-h-5" role="status" aria-live="polite">{arrival}</p>
      <TabsContent value="queue" className="space-y-4">{!state.available && <p className="text-sm text-muted-foreground">Offline — not accepting new consultations</p>}{pending.length ? pending.map(visitCard) : <p className="py-8 text-center text-muted-foreground">No patients waiting</p>}</TabsContent>
      <TabsContent value="active" className="space-y-4">{active.length ? active.map(visitCard) : <p className="py-8 text-center text-muted-foreground">No assigned consultations</p>}</TabsContent>
      <TabsContent value="history" className="space-y-4"><div className="relative max-w-lg"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search consultation history" className="ps-9" placeholder="Search patient, notes or medicine" value={search} onChange={e => setSearch(e.target.value)} /></div>{history.length ? history.map(v => <Card key={v.id} className="p-5 rounded-lg space-y-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{v.name} · {v.reason}</h3><Badge variant="secondary">Completed</Badge><span className="text-sm text-muted-foreground">{v.completedAt ? new Date(v.completedAt).toLocaleString() : ""} · {v.durationSeconds ?? 0}s</span></div>{details(v)}<div className="border-t pt-3 space-y-2"><h4 className="font-medium">Notes</h4><p className="text-sm whitespace-pre-wrap break-words">{v.notes || "No notes saved"}</p><h4 className="font-medium">Prescription drafts</h4>{v.prescriptions.length ? v.prescriptions.map((p, i) => <p className="text-sm break-words" key={i}>{p.medicine} · {p.dose} · {p.frequency} · {p.duration}</p>) : <p className="text-sm text-muted-foreground">No prescription drafts</p>}</div><Button variant="outline" onClick={() => setSelectedId(v.id)}><FileText className="h-4 w-4 me-2" />Patient journal</Button></Card>) : <p className="py-8 text-center text-muted-foreground">{search ? "No matching consultations" : "No completed consultations yet"}</p>}</TabsContent></Tabs>
    </main>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelectedId(null); }}><DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}><DialogHeader><DialogTitle>{selected?.status === "completed" ? "Patient journal" : "Consultation record"}</DialogTitle></DialogHeader>{selected && <>{selected.status !== "completed" && <ClinicalNotesPanel key={selected.id} visit={selected} />}<PatientJournal key={`journal-${selected.id}`} consultationId={selected.id} patientId={selected.patientId} patientName={selected.name} sample canAdd={selected.status === "claimed" || selected.status === "in_progress"} /></>}</DialogContent></Dialog>
  </div>;
}