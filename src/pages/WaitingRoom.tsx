import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, HeartPulse, ShieldCheck, Stethoscope, UserRound, Video } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PrejoinCameraCheck from "@/components/video/PrejoinCameraCheck";
import BookingNotifications from "@/components/BookingNotifications";
import { useBookingNotifications } from "@/hooks/use-booking-notifications";
import { onForeground } from "@/lib/foreground";

interface ConsultationData {
  id: string;
  status: string;
  payment_status?: string;
  room_url?: string | null;
  reason_description?: string | null;
}
interface DoctorInfo {
  full_name: string;
  avatar_url?: string;
  specialization?: string;
  is_verified?: boolean;
}
interface QueueData {
  position: number;
  doctor?: DoctorInfo;
}

const WaitingRoom = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get("id");
  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useBookingNotifications("patient", consultation ? [consultation] : [], !loading);

  useEffect(() => {
    let active = true;
    let fetching = false;
    let ended = false;
    setLoading(true);
    setConsultation(null);
    setQueue(null);
    setReady(false);
    setError("");

    const load = async () => {
      if (fetching || ended) return;
      fetching = true;
      try {
        if (!id) {
          navigate("/my-visits");
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate("/auth?as=patient");
          return;
        }
        const record = await supabase.from("consultations")
          .select("id, status, payment_status, room_url, reason_description")
          .eq("id", id)
          .maybeSingle();
        if (!active) return;
        if (record.error || !record.data) throw new Error("Unable to load this consultation.");
        ended = ["completed", "cancelled"].includes(record.data.status);
        setConsultation(record.data);
        setReady(!!record.data.room_url && ["claimed", "in_progress"].includes(record.data.status));
        setError("");
        if (ended) return;
        const status = await supabase.rpc("get_queue_status", { _consultation_id: id });
        if (!active) return;
        setQueue(status.error ? null : status.data as unknown as QueueData);
        setError(status.error ? "lounge.queueError" : "");
      } catch {
        if (active) {
          setConsultation(null);
          setQueue(null);
          setReady(false);
          setError("lounge.loadError");
        }
      } finally {
        fetching = false;
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = setInterval(load, 5000);
    const unsubscribe = onForeground(() => { void load(); });
    const channel = id ? supabase.channel(`waiting-${id}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultations", filter: `id=eq.${id}` }, () => { void load(); })
      .subscribe() : null;
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  if (loading || !consultation || consultation.id !== id) {
    return <main className="mx-auto max-w-lg space-y-4 p-8"><p role="status">{error ? t("lounge.loadError") : t("dashboard.loading")}</p><Button onClick={() => navigate("/my-visits")}>{t("lounge.back")}</Button></main>;
  }
  if (["completed", "cancelled"].includes(consultation.status)) {
    return <main className="mx-auto max-w-lg space-y-5 px-4 py-12">
      <LanguageSwitcher />
      <h1 className="text-3xl font-semibold">{t(consultation.status === "completed" ? "lounge.completed" : "lounge.cancelled")}</h1>
      <Button onClick={() => navigate("/my-visits")}>{t("lounge.back")}</Button>
    </main>;
  }

  const doctor = queue?.doctor;
  const assigned = consultation.status === "claimed" || consultation.status === "in_progress";
  const status = ready ? "ready" : assigned ? "preparing" : "waiting";
  return <div className="min-h-screen bg-lounge">
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6"><div className="flex items-center gap-2 text-primary"><HeartPulse className="h-7 w-7" /><span className="text-xl font-bold">DocNow</span><span className="ms-3 hidden items-center gap-1 border-s ps-4 text-xs text-muted-foreground md:flex"><ShieldCheck className="h-4 w-4" />{t("lounge.patient")}</span></div><nav className="flex items-center gap-1"><BookingNotifications role="patient" /><Button variant="ghost" size="sm" onClick={() => navigate("/my-visits")}>{t("lounge.visits")}</Button><LanguageSwitcher /></nav></div></header>
    <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:py-10">
      <Button variant="ghost" size="sm" className="mb-5 px-0" onClick={() => navigate("/my-visits")}><ArrowLeft className="me-2 h-4 w-4" />{t("lounge.back")}</Button>
      <div className="mb-7"><p className="mb-2 text-sm font-medium text-primary">{t("lounge.yourVisit")}</p><h1 className="text-3xl font-semibold">{t("lounge.title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t(ready ? "lounge.readyMessage" : assigned ? "lounge.preparingMessage" : "lounge.waitingMessage")}</p></div>
      <div className="grid items-start gap-7 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{t("lounge.devices")}</h2><span className="text-xs text-muted-foreground">{t("lounge.before")}</span></div><PrejoinCameraCheck name={t("lounge.you")} /><div className="mt-6 flex gap-3 border-t pt-5 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><p>{t("lounge.preview")}</p></div></section>
        <aside className="min-w-0 space-y-4 lg:col-span-5">
          {consultation.payment_status === "pending" && <p role="status" className="border-l-4 border-primary bg-accent p-4 text-sm">{t("lounge.unpaid")}</p>}
          <section className="flex items-center gap-4 rounded-lg border bg-card p-5"><Avatar className="h-16 w-16"><AvatarImage src={doctor?.avatar_url} alt={doctor?.full_name} /><AvatarFallback className="bg-accent text-primary"><Stethoscope className="h-7 w-7" /></AvatarFallback></Avatar><div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{doctor ? t("lounge.doctor") : t("lounge.finding")}</p><h2 className="break-words text-lg font-semibold">{doctor?.full_name || t("lounge.next")}</h2><p className="text-sm text-muted-foreground">{doctor?.specialization || t("lounge.general")}</p></div></section>
          <section className="space-y-3 rounded-lg border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t("lounge.status")}</h2><span role="status" className={ready ? "text-sm text-success" : "text-sm text-muted-foreground"}>{t(`lounge.${status}`)}</span></div>
            {!assigned && queue && Number.isInteger(queue.position) && queue.position > 0 && <p className="text-sm text-muted-foreground">{t("lounge.place")} <strong>#{queue.position}</strong></p>}
            {!ready && <p className="text-sm text-muted-foreground">{t("lounge.backgroundHint")}</p>}
            {error && <p role="status" className="text-sm text-destructive">{t(error)}</p>}
          </section>
          <section className="rounded-lg border bg-card p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />{t("lounge.reason")}</h2><p className="break-words text-sm text-muted-foreground">{consultation.reason_description || t("lounge.general")}</p></section>
          <Button className="h-12 w-full gap-2 rounded-xl font-semibold shadow-md" disabled={!ready} onClick={() => navigate(`/call/${id}`)}><Video className="h-4 w-4" />{t("lounge.join")}<ArrowRight className="ms-auto h-4 w-4" /></Button><p className="text-center text-xs text-muted-foreground">{t(ready ? "lounge.muted" : "lounge.instructions")}</p>
        </aside>
      </div>
    </main>
  </div>;
};

export default WaitingRoom;
