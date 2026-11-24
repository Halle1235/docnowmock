import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, ChevronDown, HeartPulse, Stethoscope, UserRound, Video } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PrejoinCameraCheck from "@/components/video/PrejoinCameraCheck";
import BookingNotifications from "@/components/BookingNotifications";
import { useBookingNotifications } from "@/hooks/use-booking-notifications";
import { onForeground } from "@/lib/foreground";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const statusMessage = ready ? "lounge.muted" : assigned ? "lounge.preparingMessage" : "lounge.backgroundHint";

  return (
    <div className="min-h-screen bg-lounge">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-2xl flex-wrap items-center justify-between gap-1 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2 text-primary">
            <HeartPulse aria-hidden="true" className="h-6 w-6" />
            <span className="text-xl font-bold">DocNow</span>
          </div>
          <div className="flex items-center gap-1">
            <BookingNotifications role="patient" />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-semibold">{t("lounge.title")}</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate("/my-visits")}>{t("lounge.visits")}</Button>
        </div>

        <section className={`space-y-4 rounded-xl border bg-card p-4 sm:p-5 ${ready ? "border-primary/40" : ""}`}>
          <div role="status" className="space-y-1.5">
            <h2 className="text-xl font-semibold">{t(`lounge.${status}`)}</h2>
            <p className="text-sm text-muted-foreground">{t(statusMessage)}</p>
            {!assigned && queue && Number.isInteger(queue.position) && queue.position > 0 && (
              <p className="text-sm text-muted-foreground">{t("lounge.place")} <strong>#{queue.position}</strong></p>
            )}
            {!assigned && error && <p className="text-sm text-muted-foreground">{t(error)}</p>}
          </div>
          {ready && (
            <Button className="h-12 w-full text-base" onClick={() => navigate(`/call/${id}`)}>
              <Video aria-hidden="true" className="h-4 w-4" />
              {t("lounge.join")}
            </Button>
          )}
        </section>

        <Collapsible key={consultation.id} className="rounded-xl border bg-card">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group h-auto min-h-11 w-full justify-start whitespace-normal px-4 py-2 text-start">
              <Camera aria-hidden="true" />
              {t("lounge.testDevices")}
              <ChevronDown aria-hidden="true" className="ms-auto transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t p-3 sm:p-4">
            <PrejoinCameraCheck name={t("lounge.you")} />
          </CollapsibleContent>
        </Collapsible>

        {doctor && assigned && (
          <section className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={doctor.avatar_url} alt="" />
              <AvatarFallback className="bg-accent text-primary"><Stethoscope aria-hidden="true" className="h-6 w-6" /></AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="text-sm text-muted-foreground">{t("lounge.doctor")}</h2>
              <p className="break-words font-semibold">{doctor.full_name}</p>
              {doctor.specialization && <p className="break-words text-sm text-muted-foreground">{doctor.specialization}</p>}
            </div>
          </section>
        )}

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <UserRound aria-hidden="true" className="h-4 w-4 text-primary" />
            {t("lounge.reason")}
          </h2>
          <p className="break-words text-sm text-muted-foreground">{consultation.reason_description || t("lounge.general")}</p>
        </section>
        {consultation.payment_status === "pending" && <p className="px-1 text-sm text-muted-foreground">{t("lounge.unpaid")}</p>}
      </main>
    </div>
  );
};

export default WaitingRoom;
