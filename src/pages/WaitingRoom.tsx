import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Clock3, HeartPulse, Loader2, ShieldCheck, Stethoscope, UserRound, Video } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PrejoinCameraCheck from "@/components/video/PrejoinCameraCheck";
import BookingNotifications from "@/components/BookingNotifications";
import { useBookingNotifications } from "@/hooks/use-booking-notifications";

interface ConsultationData { id: string; status: string; payment_status?: string; room_url?: string | null; reason_description?: string | null }
interface DoctorInfo { full_name: string; avatar_url?: string; specialization?: string; is_verified?: boolean }
interface QueueData { position: number; estimated_minutes: number; available_doctors: number; doctor?: DoctorInfo }
const WaitingRoom = () => {
  const navigate = useNavigate(); const [params] = useSearchParams();
  const id = params.get("id");
  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useBookingNotifications("patient", consultation ? [consultation] : [], !loading);
  useEffect(() => {
    let active = true; let fetching = false;
    const load = async () => {
      if (fetching) return; fetching = true;
      try {
          if (!id) { navigate("/my-visits"); return; }
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { navigate("/auth"); return; }
          const [record, status] = await Promise.all([
            supabase.from("consultations").select("id, status, payment_status, room_url, reason_description").eq("id", id).maybeSingle(),
            supabase.rpc("get_queue_status", { _consultation_id: id }),
          ]);
          if (!active) return;
          if (record.error || !record.data) throw new Error("Unable to load this consultation.");
          setConsultation(record.data); setReady(!!record.data.room_url && ["claimed", "in_progress"].includes(record.data.status));
          if (!status.error && status.data) setQueue(status.data as unknown as QueueData);
          setError(status.error ? "Queue estimate unavailable" : "");
      } catch { if (active) { setReady(false); setError("Unable to load consultation status. Trying again…"); } }
      finally { fetching = false; if (active) setLoading(false); }
    };
    void load(); const timer = setInterval(load, 5000);
    const channel = id ? supabase.channel(`waiting-${id}-${crypto.randomUUID()}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultations", filter: `id=eq.${id}` }, () => { void load(); }).subscribe() : null;
    return () => { active = false; clearInterval(timer); if (channel) void supabase.removeChannel(channel); };
  }, [id, navigate]);
  const doctor = queue?.doctor;
  const canJoin = ready && !!consultation;
  const wait = ready ? "Ready now" : queue ? queue.estimated_minutes < 3 ? "< 3 mins" : `~${queue.estimated_minutes} mins` : "—";
  return <div className="min-h-screen bg-lounge">
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6"><div className="flex items-center gap-2 text-primary"><HeartPulse className="h-7 w-7" /><span className="text-xl font-bold">DocNow</span><span className="ms-3 hidden items-center gap-1 border-s ps-4 text-xs text-muted-foreground md:flex"><ShieldCheck className="h-4 w-4" />Patient consultation</span></div><nav className="flex items-center gap-1"><BookingNotifications role="patient" /><Button variant="ghost" size="sm" onClick={() => navigate("/my-visits")}>My visits</Button><LanguageSwitcher /></nav></div></header>
    <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:py-10">
      <Button variant="ghost" size="sm" className="mb-5 px-0" onClick={() => navigate("/my-visits")}><ArrowLeft className="me-2 h-4 w-4" />Back to my visits</Button>
      <div className="mb-7"><p className="mb-2 text-sm font-medium text-primary">YOUR CONSULTATION</p><h1 className="text-3xl font-semibold">Waiting room</h1><p className="mt-2 text-sm text-muted-foreground">{ready ? "Your doctor is ready to see you." : "Your doctor will be with you shortly."}</p></div>
      <div className="grid items-start gap-7 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Camera & microphone</h2><span className="text-xs text-muted-foreground">Before you join</span></div><PrejoinCameraCheck name="You" /><div className="mt-6 flex gap-3 border-t pt-5 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><p>Your device preview stays on this device. UAE PASS verification is not linked.</p></div></section>
        <aside className="min-w-0 space-y-4 lg:col-span-5">
          {consultation?.payment_status === 'pending' && <p role="status" className="border-l-4 border-primary bg-accent p-4 text-sm">Unpaid booking · No payment has been taken.</p>}
          <section className="flex items-center gap-4 rounded-lg border bg-card p-5"><Avatar className="h-16 w-16"><AvatarImage src={doctor?.avatar_url} alt={doctor?.full_name} /><AvatarFallback className="bg-accent text-primary"><Stethoscope className="h-7 w-7" /></AvatarFallback></Avatar><div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{doctor ? "Your doctor" : "Finding your doctor"}</p><h2 className="break-words text-lg font-semibold">{doctor?.full_name || "Next available doctor"}</h2><p className="text-sm text-muted-foreground">{doctor?.specialization || "General consultation"}</p></div></section>
          <section className="rounded-lg border bg-card p-5"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">Consultation status</h2><span className={`flex items-center gap-1.5 text-xs ${ready ? "text-success" : "text-muted-foreground"}`}><span className={`h-2 w-2 rounded-full ${ready ? "bg-success" : "bg-primary"}`} />{ready ? "Doctor ready" : "Waiting"}</span></div><div className="grid grid-cols-2 gap-4"><div><p className="text-xs text-muted-foreground">Estimated wait</p><p className="mt-2 text-2xl font-semibold text-primary">{wait}</p></div><div className="border-s ps-5"><p className="text-xs text-muted-foreground">Your place in line</p><p className="mt-2 text-2xl font-semibold">{queue ? `#${queue.position}` : "—"}</p></div></div><p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Wait times are estimates</p>{error && <p role="status" className="mt-3 text-sm text-destructive">{error}</p>}</section>
          <section className="rounded-lg border bg-card p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />Reason for your visit</h2><p className="break-words text-sm text-muted-foreground">{consultation?.reason_description || "General consultation"}</p></section>
          <Button className="h-12 w-full gap-2 rounded-xl font-semibold shadow-md" disabled={!canJoin || loading} onClick={() => navigate(`/call/${id}`)}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}Join Video Consultation<ArrowRight className="ms-auto h-4 w-4" /></Button><p className="text-center text-xs text-muted-foreground">{ready && canJoin ? "Your microphone will be muted when you enter." : "You can enter once the doctor starts the call."}</p>
        </aside>
      </div>
    </main>
  </div>;
};
export default WaitingRoom;
