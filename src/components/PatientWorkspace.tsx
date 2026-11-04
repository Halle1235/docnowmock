import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarClock, Camera, CheckCircle, Clock, Download, FileText, HeartPulse, LogOut, Star, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LanguageSwitcher from "./LanguageSwitcher";
import DeviceCheck from "./DeviceCheck";
import { patientWorkspace, usePatientWorkspace, SAMPLE_VISIT_PRICE, type PatientVisit } from "@/lib/patient-workspace";
import { demoCallPath } from "@/lib/mock-login";
import { buildVisitPdf } from "@/lib/visit-pdf";
import { deliverFile } from "@/lib/file-download";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function VisitDownload({ visit, kind }: { visit: PatientVisit; kind: "prescription" | "receipt" }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; buildVisitPdf(visit, kind, window.location.origin).then(value => { if (active) setBlob(value); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [visit, kind]);
  return <Button variant="outline" disabled={!blob} onClick={() => { if (blob) void deliverFile(blob, `docnow-sample-${kind}-${visit.id}.pdf`); }}><Download className="h-4 w-4 me-2" />{error ? "PDF unavailable" : kind === "prescription" ? "Download prescription PDF" : "Download receipt"}</Button>;
}
function Rating({ visit }: { visit: PatientVisit }) {
  const [rating, setRating] = useState(visit.rating ?? 0);
  const [comment, setComment] = useState(visit.comment ?? "");
  return <div className="border-t pt-4 space-y-3"><h4 className="font-medium">Rate your doctor</h4><div className="flex gap-1" role="group" aria-label="Doctor rating">{[1, 2, 3, 4, 5].map(value => <Button key={value} size="icon" variant={rating >= value ? "default" : "outline"} aria-label={`${value} star${value > 1 ? "s" : ""}`} aria-pressed={rating === value} onClick={() => setRating(value)}><Star className="h-4 w-4" /></Button>)}</div><Textarea aria-label="Rating comment" maxLength={1000} rows={2} placeholder="Comment (optional)" value={comment} onChange={e => setComment(e.target.value)} /><Button size="sm" disabled={!rating} onClick={() => { if (patientWorkspace.rate(visit.id, rating, comment)) toast.success("Sample rating saved"); }}>Save rating</Button>{visit.rating && <p className="text-xs text-muted-foreground" role="status">Saved · {visit.rating}/5</p>}</div>;
}
export default function PatientWorkspace() {
  const navigate = useNavigate(); const [params] = useSearchParams();
  const state = usePatientWorkspace();
  const [profile, setProfile] = useState(state.profile);
  const [doctorInCall, setDoctorInCall] = useState(false);
  const [queueError, setQueueError] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const booking = state.visits.find(visit => visit.id === bookingId);
  const waiting = state.visits.filter(v => v.status === "waiting");
  const completed = state.visits.filter(v => v.status === "completed");
  useEffect(() => {
    let active = true;
    const check = async () => { try { const { data, error } = await supabase.functions.invoke("demo-call-room", { body: { action: "status" } }); if (active) { setDoctorInCall(!error && !!data?.doctorInCall); setQueueError(!!error); } } catch { if (active) { setDoctorInCall(false); setQueueError(true); } } };
    void check(); const timer = setInterval(check, 4000); return () => { active = false; clearInterval(timer); };
  }, []);
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card"><div className="container px-4 py-4 flex items-center justify-between gap-2"><h1 className="text-2xl font-bold text-primary">DocNow · Patients</h1><div className="flex items-center gap-2"><LanguageSwitcher /><Button variant="ghost" size="sm" onClick={() => navigate("/auth")}><LogOut className="h-4 w-4 me-2" />Log out</Button></div></div></header>
    <main className="container max-w-5xl px-4 py-8 space-y-7">
      <div><h2 className="text-3xl font-bold">My visits</h2><p className="text-sm text-muted-foreground mt-2">Sample mode · No real payments or clinical documents · Changes reset on refresh</p></div>
      {params.get("verify") && <section role="status" className="border border-destructive rounded-lg p-5 space-y-2"><h3 className="font-semibold">Not a valid prescription</h3><p className="text-sm">This QR belongs to a sample document. No prescription has been issued, signed, or verified. Do not dispense medicine against it.</p></section>}
      <section aria-label="Queue status" className="border-y py-5 grid grid-cols-2 md:grid-cols-4 gap-5"><div><p className="text-sm text-muted-foreground">Place in line</p><p className="text-3xl font-semibold mt-2">{waiting.length ? "#1" : "—"}</p></div><div><p className="text-sm text-muted-foreground">Estimated wait</p><p className="text-3xl font-semibold mt-2">{waiting.length ? doctorInCall ? "Ready" : "~3 min" : "—"}</p></div><div><p className="text-sm text-muted-foreground">Call status</p><p className="font-semibold mt-3">{queueError ? "Status unavailable" : doctorInCall ? "Doctor in call" : "Waiting for doctor"}</p></div><div className="flex items-center"><Button variant="outline" onClick={() => setDeviceOpen(true)}><Camera className="h-4 w-4 me-2" />Device check</Button></div></section>
      <Tabs defaultValue="visits"><TabsList className="h-auto flex flex-wrap justify-start gap-1"><TabsTrigger value="visits"><Clock className="h-4 w-4 me-2" />Visits</TabsTrigger><TabsTrigger value="profile"><HeartPulse className="h-4 w-4 me-2" />Health profile</TabsTrigger><TabsTrigger value="payments"><FileText className="h-4 w-4 me-2" />Payments</TabsTrigger><TabsTrigger value="followups"><CalendarClock className="h-4 w-4 me-2" />Follow-ups</TabsTrigger></TabsList>
        <TabsContent value="visits" className="space-y-4 mt-5">{waiting.map(visit => <Card key={visit.id} className="p-5 space-y-4 rounded-lg"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{visit.reason}</h3><Badge variant="outline">Waiting</Badge></div><p className="text-sm text-muted-foreground">{visit.doctor} · Sample visit</p><div className="flex flex-wrap gap-3 items-center"><Button disabled={!doctorInCall} onClick={() => navigate(`/waiting-room?id=demo&visit=${visit.id}`)}><Video className="h-4 w-4 me-2" />Join call</Button><span className="text-sm text-muted-foreground">{doctorInCall ? "Doctor has started the call" : "Waiting for the doctor to start…"}</span></div></Card>)}
          {completed.map(visit => <Card key={visit.id} className="p-5 space-y-4 rounded-lg"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{visit.reason}</h3><Badge variant="secondary"><CheckCircle className="h-3 w-3 me-1" />Completed</Badge></div><p className="text-sm text-muted-foreground">{visit.doctor} · {new Date(visit.createdAt).toLocaleDateString()}</p><div className="space-y-2"><h4 className="font-medium">Prescription drafts</h4>{visit.prescriptions.length ? visit.prescriptions.map((p, i) => <p key={i} className="text-sm break-words">{p.medicine} · {p.dose} · {p.frequency} · {p.duration}</p>) : <p className="text-sm text-muted-foreground">No medicine prescribed</p>}<VisitDownload visit={visit} kind="prescription" /></div><Rating key={visit.id} visit={visit} /></Card>)}
        </TabsContent>
        <TabsContent value="profile" className="mt-5 space-y-5 max-w-2xl"><h3 className="text-xl font-semibold">Health profile</h3>{([['allergies', 'Allergies'], ['medicines', 'Current medicines'], ['conditions', 'Long-term conditions']] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`health-${key}`}>{label}</Label><Textarea id={`health-${key}`} rows={3} maxLength={2000} value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></div>)}<Button onClick={() => { if (patientWorkspace.saveProfile(profile)) toast.success("Sample health profile saved"); }}>Save health profile</Button><p className="text-xs text-muted-foreground">Shared with the sample doctor on this device · Do not enter real health information</p></TabsContent>
        <TabsContent value="payments" className="mt-5 space-y-4"><h3 className="text-xl font-semibold">Payment history</h3>{state.visits.map(visit => <div key={visit.id} className="border-b py-4 flex flex-wrap justify-between items-center gap-4"><div><p className="font-medium">{visit.reason}</p><p className="text-sm text-muted-foreground">{new Date(visit.createdAt).toLocaleDateString()} · {visit.amount ? "Simulated payment" : "No charge"}</p></div><span className="font-semibold">AED {visit.amount.toFixed(2)}</span><VisitDownload visit={visit} kind="receipt" /></div>)}</TabsContent>
        <TabsContent value="followups" className="mt-5 space-y-4"><h3 className="text-xl font-semibold">Suggested check-ups</h3>{completed.filter(visit => visit.followUpDate).map(visit => <Card key={visit.id} className="p-5 rounded-lg space-y-3"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{visit.followUpReason}</h4><Badge variant="outline">{visit.followUpDate}</Badge></div><p className="text-sm text-muted-foreground">{visit.doctor} · Doctor-suggested · Patient agreement required</p><Button disabled={visit.rebooked || !!waiting.length} onClick={() => { setAgreed(false); setBookingId(visit.id); }}>{visit.rebooked ? "Rebooked" : `Rebook · AED ${SAMPLE_VISIT_PRICE}`}</Button>{waiting.length > 0 && !visit.rebooked && <p className="text-sm text-muted-foreground">Complete your current visit before rebooking</p>}</Card>)}{!completed.some(v => v.followUpDate) && <p className="text-muted-foreground">No check-ups suggested</p>}</TabsContent>
      </Tabs>
    </main>
    <Dialog open={!!booking} onOpenChange={open => { if (!open) { setBookingId(null); setAgreed(false); } }}><DialogContent className="max-w-lg" aria-describedby={undefined}><DialogHeader><DialogTitle>Confirm paid follow-up</DialogTitle></DialogHeader>{booking && <div className="space-y-5"><div><p className="font-medium">{booking.reason}</p><p className="text-sm text-muted-foreground">{booking.doctor} · Suggested check-up: {booking.followUpDate}</p></div><div className="border-y py-4 flex justify-between gap-3"><span>Follow-up consultation</span><strong>AED {SAMPLE_VISIT_PRICE.toFixed(2)}</strong></div><div className="flex gap-3 items-start"><Checkbox id="followup-agreement" checked={agreed} onCheckedChange={value => setAgreed(value === true)} /><Label htmlFor="followup-agreement" className="leading-5">I agree to this doctor-suggested follow-up and the AED {SAMPLE_VISIT_PRICE} consultation fee.</Label></div><p className="text-sm text-muted-foreground">Mock payment only · No money charged · No card details needed</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setBookingId(null); setAgreed(false); }}>Cancel</Button><Button disabled={!agreed || booking.rebooked || !!waiting.length} onClick={() => { if (patientWorkspace.payAndRebook(booking.id, agreed)) { setBookingId(null); setAgreed(false); toast.success("Mock payment completed · Paid follow-up booked"); } else toast.error("Follow-up cannot be booked right now"); }}>Simulate payment · AED {SAMPLE_VISIT_PRICE}</Button></div></div>}</DialogContent></Dialog>
    <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}><DialogContent className="max-w-xl" aria-describedby={undefined}><DialogHeader><DialogTitle>Camera & microphone check</DialogTitle></DialogHeader><DeviceCheck canJoin={doctorInCall && waiting.length > 0} onJoin={() => navigate(demoCallPath("patient"))} /></DialogContent></Dialog>
  </div>;
}