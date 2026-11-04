import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, User } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { toast } from "sonner";

interface DoctorInfo {
  full_name: string;
  avatar_url?: string;
  specialization?: string;
  is_verified?: boolean;
}

interface QueueStatus {
  position: number;
  estimated_minutes: number;
  available_doctors: number;
}

interface ConsultationData {
  id: string;
  status: string;
  doctor_id?: string;
  room_url?: string | null;
}

const WaitingRoom = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const consultationId = searchParams.get("id");

  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctorInfo, setDoctorInfo] = useState<DoctorInfo | null>(null);
  const [queue, setQueue] = useState<QueueStatus | null>(null);

  const loadQueue = async () => {
    if (!consultationId) return;
    const { data, error } = await supabase.rpc("get_queue_status", { _consultation_id: consultationId });
    if (error || !data) return;
    const d = data as any;
    setQueue({ position: d.position, estimated_minutes: d.estimated_minutes, available_doctors: d.available_doctors });
    if (d.doctor) {
      setDoctorInfo({
        full_name: d.doctor.full_name || "Your doctor",
        avatar_url: d.doctor.avatar_url ?? undefined,
        specialization: d.doctor.specialization ?? undefined,
        is_verified: d.doctor.is_verified ?? false,
      });
    }
  };

  useEffect(() => {
    if (!consultationId) return;
    loadQueue();
    const timer = setInterval(loadQueue, 15000);
    return () => clearInterval(timer);
  }, [consultationId]);

  useEffect(() => {
    if (!consultationId) {
      navigate("/");
      return;
    }

    loadConsultation();
    const cleanup = subscribeToConsultation();
    return cleanup;
  }, [consultationId]);

  const loadConsultation = async () => {
    try {
      // Make sure the signed-in session is ready before reading the booking
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to view your consultation");
        navigate("/auth");
        return;
      }

      let data: ConsultationData | null = null;
      for (let attempt = 0; attempt < 3 && !data; attempt++) {
        const res = await supabase
          .from("consultations")
          .select("id, status, doctor_id, room_url")
          .eq("id", consultationId)
          .maybeSingle();
        if (res.error) throw res.error;
        data = res.data;
        if (!data) await new Promise((r) => setTimeout(r, 700));
      }
      if (!data) throw new Error("Consultation not found");
      setConsultation(data);

      if (data.room_url) {
        navigate(`/call/${consultationId}`);
        return;
      }

      if (data.doctor_id) {
        await loadDoctorInfo(data.doctor_id);
      }
    } catch (error: any) {
      console.error("Error loading consultation:", error);
      toast.error("Failed to load consultation");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const loadDoctorInfo = async (doctorId: string) => {
    try {
      await loadQueue();
      return;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", doctorId)
        .maybeSingle();

      const { data: doctorData } = await supabase
        .from("doctor_profiles")
        .select("avatar_url")
        .eq("user_id", doctorId)
        .maybeSingle();

      setDoctorInfo({
        full_name: profileData?.full_name || "Your doctor",
        avatar_url: doctorData?.avatar_url ?? undefined,
      });
    } catch (error) {
      console.error("Error loading doctor info:", error);
    }
  };

  const subscribeToConsultation = () => {
    const channel = supabase
      .channel(`consultation-${consultationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "consultations",
          filter: `id=eq.${consultationId}`,
        },
        async (payload) => {
          const updated = payload.new as ConsultationData;
          setConsultation(updated);
          loadQueue();

          if (updated.room_url) {
            navigate(`/call/${consultationId}`);
            return;
          }

          if (updated.doctor_id && !doctorInfo) {
            await loadDoctorInfo(updated.doctor_id);
            toast.success(t("waitingRoom.doctorAssigned"));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isDoctorAssigned = consultation?.status === "claimed" && doctorInfo;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">{t("header.brand")}</h1>
          <div className="flex items-center gap-2">
            <a href="/my-visits" className="text-sm font-medium text-primary hover:underline">My visits</a>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-8 max-w-md w-full">
          {!isDoctorAssigned ? (
            <>
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">{t("waitingRoom.title")}</h2>
                <p className="text-muted-foreground">{t("waitingRoom.subtitle")}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="grid grid-cols-2 divide-x">
                  <div className="px-2">
                    <p className="text-sm text-muted-foreground">Your place in line</p>
                    <p className="text-3xl font-bold text-primary mt-1">
                      {queue ? `#${queue.position}` : "—"}
                    </p>
                  </div>
                  <div className="px-2">
                    <p className="text-sm text-muted-foreground">{t("waitingRoom.estimatedWait")}</p>
                    <p className="text-3xl font-bold text-primary mt-1">
                      {queue ? `~${queue.estimated_minutes} min` : "—"}
                    </p>
                  </div>
                </div>
                {queue && (
                  <p className="text-xs text-muted-foreground mt-4">
                    {queue.available_doctors} doctor{queue.available_doctors === 1 ? "" : "s"} online · updates live
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">
                {t("waitingRoom.lookingForDoctor")}
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-green-100 p-3">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold">{t("waitingRoom.doctorAssigned")}</h2>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border p-6 flex flex-col items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={doctorInfo.avatar_url} />
                  <AvatarFallback className="bg-primary/10">
                    <User className="h-10 w-10 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold text-lg">Dr. {doctorInfo.full_name.replace(/^Dr\.?\s*/i, "")}</div>
                  {doctorInfo.specialization && (
                    <div className="text-sm font-medium text-primary">{doctorInfo.specialization}</div>
                  )}
                  {doctorInfo.is_verified && (
                    <div className="text-xs text-muted-foreground mt-1">✓ Licensed &amp; verified</div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    {t("waitingRoom.doctorAccepted")}
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {t("waitingRoom.preparing")}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default WaitingRoom;
