import { dailyStartOptions } from "@/lib/daily-presentation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DailyIframe, { type DailyCall, type DailyParticipant } from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Clock,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Settings,
  Sparkles,
  Stethoscope,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import PatientJournal from "@/components/PatientJournal";
import CallChat from "@/components/CallChat";
import { cn } from "@/lib/utils";

const playable = (p: DailyParticipant | undefined, kind: "video" | "audio") => {
  const t = p?.tracks?.[kind];
  return t && t.state === "playable" ? (t.persistentTrack ?? (t as any).track ?? null) : null;
};

function VideoTile({
  participant,
  label,
  local,
  placeholder,
  reconnecting,
}: {
  participant?: DailyParticipant;
  label: string;
  local?: boolean;
  placeholder: ReactNode;
  reconnecting?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = playable(participant, "video");
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = track ? new MediaStream([track]) : null;
    if (track) {
      ref.current.play().catch(() => {});
    }
  }, [track]);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-room-card shadow-2xl">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={cn("h-full w-full object-cover", local && "-scale-x-100", !track && "hidden")}
      />
      {!track && <div className="absolute inset-0 flex items-center justify-center text-white/80">{placeholder}</div>}
      {reconnecting && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-black/80 p-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          <p className="font-semibold text-sm text-white">{label} reconnecting…</p>
          <p className="text-xs text-white/70 max-w-xs">
            Connection interrupted. Holding call room open while network recovers.
          </p>
        </div>
      )}
      <span className="absolute bottom-3 start-3 z-10 rounded-lg border border-black/30 bg-black/85 px-3 py-1 text-xs font-medium text-white shadow-md">
        {label}
      </span>
    </div>
  );
}

function RemoteAudio({ participant }: { participant?: DailyParticipant }) {
  const ref = useRef<HTMLAudioElement>(null);
  const track = playable(participant, "audio");
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = track ? new MediaStream([track]) : null;
      if (track) {
        ref.current.play().catch((e) => console.warn("[RemoteAudio] play blocked:", e));
      }
    }
  }, [track]);
  return <audio ref={ref} autoPlay playsInline />;
}

function DockButton({
  label,
  icon,
  onClick,
  state = "on",
  badge,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  state?: "on" | "active" | "off" | "leave";
  badge?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-xl shadow-md transition-colors",
          state === "on" && "border border-white/10 bg-room-button text-white hover:bg-room-button-hover",
          state === "active" && "bg-white font-semibold text-room-ink",
          state === "off" && "border border-destructive/30 bg-destructive/25 text-destructive-foreground",
          state === "leave" && "bg-room-leave text-white hover:bg-room-leave-hover",
        )}
      >
        {icon}
        {!!badge && (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-room-leave px-1 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      <span className="text-[11px] text-white/85">{label}</span>
    </div>
  );
}

const VideoCall = () => {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();
  const callRef = useRef<DailyCall | null>(null);
  const joinedUrlRef = useRef<string | null>(null);
  const postCallJournal = useRef(false);
  const [loading, setLoading] = useState(true);
  const [waitingForDoctor, setWaitingForDoctor] = useState(false);
  const [joinedCall, setJoinedCall] = useState<DailyCall | null>(null);
  const [participants, setParticipants] = useState<Record<string, DailyParticipant>>({});
  const [panel, setPanel] = useState<"chat" | "notes" | null>(null);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const [unread, setUnread] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordReason, setRecordReason] = useState("");
  const [roomExpired, setRoomExpired] = useState(false);
  const [liveDoctor, setLiveDoctor] = useState(false);
  const [ending, setEnding] = useState(false);
  const [callError, setCallError] = useState(false);
  const [myName, setMyName] = useState("You");
  const [dismissTimeWarning, setDismissTimeWarning] = useState(false);
  const warned15MinRef = useRef(false);
  const warned5MinRef = useRef(false);
  const [blurOn, setBlurOn] = useState(false);
  const [networkState, setNetworkState] = useState<"good" | "warning" | "bad" | "reconnecting">("good");
  const [remoteReconnecting, setRemoteReconnecting] = useState(false);

  const toggleBlur = async () => {
    if (!joinedCall) return;
    const next = !blurOn;
    try {
      await (joinedCall as any).updateInputSettings({
        video: {
          processor: next ? { type: "background-blur", config: { strength: 0.5 } } : { type: "none" },
        },
      });
      setBlurOn(next);
      toast.success(next ? "Background blur enabled" : "Background blur turned off");
    } catch {
      toast.error("Background blur is not supported on this device/browser.");
    }
  };

  const remainingSeconds = Math.max(0, 3600 - elapsed);
  const remainingMinutes = Math.ceil(remainingSeconds / 60);
  const isUnder15Min = elapsed >= 45 * 60 && elapsed < 60 * 60;
  const isUnder5Min = elapsed >= 55 * 60 && elapsed < 60 * 60;

  useEffect(() => {
    if (elapsed >= 45 * 60 && !warned15MinRef.current) {
      warned15MinRef.current = true;
      toast.warning("15 minutes remaining in this consultation session.", {
        description: "Please conclude your review, clinical notes, and treatment plan.",
        duration: 9000,
      });
    }
    if (elapsed >= 55 * 60 && !warned5MinRef.current) {
      warned5MinRef.current = true;
      toast.error("5 minutes remaining — consultation will conclude shortly.", {
        duration: 9000,
      });
    }
  }, [elapsed]);

  useEffect(() => {
    if (!joinedCall) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    let wakeLock: any = null;
    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock
        ?.request("screen")
        .then((lock: any) => {
          wakeLock = lock;
        })
        .catch(() => {});
    }

    return () => {
      clearInterval(timer);
      wakeLock?.release().catch(() => {});
    };
  }, [joinedCall]);

  useEffect(() => {
    if (!consultationId) {
      navigate("/");
      return;
    }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let meetingToken: string | undefined;

    const destroyExisting = async () => {
      try {
        const existing = (DailyIframe as any).getCallInstance?.();
        if (existing) {
          try {
            await existing.leave();
          } catch {}
          try {
            await existing.destroy();
          } catch {}
        }
      } catch {}
      if (callRef.current) {
        try {
          await callRef.current.destroy();
        } catch {}
        callRef.current = null;
      }
    };

    const join = async (url: string) => {
      if (cancelled || (joinedUrlRef.current === url && callRef.current)) return;
      await destroyExisting();
      if (cancelled) return;
      try {
        const call = DailyIframe.createCallObject(dailyStartOptions);
        callRef.current = call;
        joinedUrlRef.current = url;
        const sync = () => {
          if (cancelled) return;
          const currentParticipants = call.participants();
          setParticipants({ ...currentParticipants });
          const others = Object.values(currentParticipants).filter((p) => !p.local);
          const other = others[0];
          if (other) {
            const isReconnecting =
              (other as any).reconnecting ||
              other.tracks?.video?.state === "interrupted" ||
              other.tracks?.audio?.state === "interrupted";
            setRemoteReconnecting(!!isReconnecting);
          } else {
            setRemoteReconnecting(false);
          }
        };
        ["participant-joined", "participant-updated", "participant-left", "track-started", "track-stopped"].forEach(
          (ev) => call.on(ev as any, sync),
        );
        call.on("network-quality-change", (ev: any) => {
          if (cancelled) return;
          if (ev?.networkState) {
            setNetworkState(ev.networkState === "bad" ? "bad" : ev.networkState === "warning" ? "warning" : "good");
          }
        });
        call.on("network-connection", (ev: any) => {
          if (cancelled) return;
          if (ev?.event === "interrupted" || ev?.event === "reconnecting") {
            setNetworkState("reconnecting");
          } else if (ev?.event === "connected") {
            setNetworkState("good");
          }
        });
        call.on("left-meeting", () => {
          setJoinedCall(null);
          navigate(postCallJournal.current ? "/doctor-dashboard" : "/my-visits", {
            state: postCallJournal.current ? { journalId: consultationId } : null,
          });
        });
        call.on("error", (ev: any) => toast.error(ev?.errorMsg || "Call error"));
        call.on("joined-meeting", () => {
          if (!cancelled) {
            setLoading(false);
            setWaitingForDoctor(false);
            setJoinedCall(call);
            sync();
          }
        });

        const user = (await supabase.auth.getUser()).data.user;
        const { data: profile } = user
          ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
          : { data: null };
        if (profile?.full_name) setMyName(profile.full_name);
        if (cancelled) {
          try {
            await call.destroy();
          } catch {}
          callRef.current = null;
          joinedUrlRef.current = null;
          return;
        }
        await call.join({
          url,
          token: meetingToken,
          ...dailyStartOptions,
          userName: profile?.full_name || "Participant",
        });
        if (cancelled) {
          try {
            await call.destroy();
          } catch {}
          callRef.current = null;
          joinedUrlRef.current = null;
          return;
        }
        setLoading(false);
        setWaitingForDoctor(false);
        setJoinedCall(call);
        sync();
      } catch (e: any) {
        if (!cancelled) {
          setLoading(false);
          setCallError(true);
        }
        toast.error(e?.message || "Could not join the call");
        if (callRef.current) {
          try {
            await callRef.current.destroy();
          } catch {}
          callRef.current = null;
          joinedUrlRef.current = null;
        }
      }
    };

    const tryStart = async () => {
      try {
        const { data: record } = await supabase.rpc("get_authorized_call_record", { _consultation_id: consultationId });
        if (!cancelled && record && typeof record === "object" && "reason_description" in record) {
          setRecordReason(String(record.reason_description || ""));
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!cancelled) setLiveDoctor(!!user && record.doctor_id === user.id);
        }
        const { data, error } = await supabase.functions.invoke("create-daily-room", { body: { consultationId } });
        if (cancelled) return;
        if (error) {
          const ctx: any = (error as any).context;
          const status = ctx?.status;
          if (status === 410) {
            setRoomExpired(true);
            setLoading(false);
            return;
          }
          if (status === 409) {
            setWaitingForDoctor(true);
            setLoading(false);
            return;
          }
          let bodyText = "";
          try {
            bodyText = await ctx?.text?.();
          } catch {}
          throw new Error(bodyText || error.message || "Edge function failed");
        }
        if (!data?.url) throw new Error("No room URL returned");
        meetingToken = data.token;
        await join(data.url);
      } catch (e: any) {
        if (cancelled) return;
        toast.error(e?.message || "Could not start the call");
        setLoading(false);
        setCallError(true);
      }
    };

    tryStart();
    channel = supabase
      .channel(`videocall-${consultationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "consultations", filter: `id=eq.${consultationId}` },
        (payload) => {
          if (["completed", "cancelled"].includes((payload.new as any)?.status)) {
            void callRef.current?.leave();
            setRoomExpired(true);
            return;
          }
          const url = (payload.new as any)?.room_url;
          if (url && joinedUrlRef.current !== url) tryStart();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (callRef.current) {
        try {
          callRef.current.destroy();
        } catch {}
        callRef.current = null;
        joinedUrlRef.current = null;
      }
    };
  }, [consultationId, navigate]);

  const leave = async () => {
    if (ending) return;
    if (liveDoctor && consultationId) {
      postCallJournal.current = true;
      setEnding(true);
      const { error } = await supabase.functions.invoke("create-daily-room", {
        body: { consultationId, action: "end" },
      });
      setEnding(false);
      if (error) {
        postCallJournal.current = false;
        toast.error("Room closure could not be confirmed. Please retry ending the consultation.");
        return;
      }
    }
    if (callRef.current) {
      try {
        await callRef.current.leave();
      } catch {}
      try {
        callRef.current.destroy();
      } catch {}
      callRef.current = null;
    }
    navigate(liveDoctor ? "/doctor-dashboard" : "/my-visits", {
      state: postCallJournal.current ? { journalId: consultationId } : null,
    });
  };

  const exitToDashboard = () => {
    if (callRef.current) {
      try {
        void callRef.current.leave();
      } catch {}
      try {
        void callRef.current.destroy();
      } catch {}
      callRef.current = null;
    }
    navigate("/doctor-dashboard");
  };

  const local = participants.local;
  const remote = Object.values(participants).find((p) => !p.local);
  const camOn = !!local?.video;
  const micOn = !!local?.audio;
  const count = Object.keys(participants).length || 1;
  const togglePanel = (next: "chat" | "notes") => {
    setPanel((p) => (p === next ? null : next));
    if (next === "chat") setUnread(0);
  };
  const remoteLabel = remote?.user_name || (liveDoctor ? "Patient" : "Your doctor");
  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-room text-white">
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="text-xl font-bold tracking-tight text-white/95 sm:text-2xl">DocNow</span>
          <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white font-medium shadow-sm">
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">/consultation</span>
            <span className="border-s border-white/20 ps-2">{count}/2</span>
            {joinedCall && (
              <time aria-label="Call duration" className="border-s border-white/20 ps-2 font-mono tabular-nums">
                {timer}
              </time>
            )}
            {joinedCall && isUnder15Min && (
              <span
                aria-label="Time remaining"
                className={cn(
                  "border-s border-white/20 ps-2 font-semibold flex items-center gap-1",
                  isUnder5Min ? "text-rose-400 animate-pulse" : "text-amber-300",
                )}
              >
                <Clock className="h-3 w-3" />
                {remainingMinutes}m left
              </span>
            )}
          </span>

          {/* Live Network Quality Indicator */}
          {joinedCall && (
            <span
              title={`Network connection: ${networkState}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors",
                networkState === "good" && "border-emerald-500/30 bg-emerald-950/40 text-emerald-300",
                networkState === "warning" && "border-amber-500/30 bg-amber-950/40 text-amber-300",
                networkState === "bad" && "border-rose-500/30 bg-rose-950/40 text-rose-300",
                networkState === "reconnecting" && "border-amber-400/40 bg-amber-900/60 text-amber-200 animate-pulse",
              )}
            >
              {networkState === "reconnecting" ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : networkState === "bad" ? (
                <WifiOff className="h-3 w-3 text-rose-400" />
              ) : (
                <Wifi className="h-3 w-3" />
              )}
              <span className="hidden md:inline">
                {networkState === "reconnecting"
                  ? "Reconnecting…"
                  : networkState === "bad"
                    ? "Weak Signal"
                    : networkState === "warning"
                      ? "Fair"
                      : "Good Signal"}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {liveDoctor && (
            <button
              type="button"
              onClick={() => togglePanel("notes")}
              className={cn(
                "hidden h-10 items-center gap-2 rounded-lg px-3 text-sm shadow-md sm:flex",
                panel === "notes"
                  ? "bg-white font-semibold text-room-ink"
                  : "border border-white/10 bg-room-button hover:bg-room-button-hover",
              )}
            >
              <FileText className="h-4 w-4" />
              Clinical Notes
            </button>
          )}
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => toast.info("Camera and microphone can be changed from your browser's site settings.")}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-room-button shadow-md hover:bg-room-button-hover"
          >
            <Settings className="h-4 w-4" />
          </button>
          <span
            aria-label={myName}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-sm font-bold text-room-ink"
          >
            {myName.charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-3 sm:px-5">
          {/* 15-Minute Remaining Alert Banner */}
          {joinedCall && isUnder15Min && !dismissTimeWarning && (
            <div
              role="alert"
              className="absolute top-4 start-1/2 -translate-x-1/2 z-30 flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-neutral-900/95 px-4 py-2.5 text-xs text-amber-200 shadow-2xl"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
                <span>
                  <strong>15 minutes remaining:</strong> Session will conclude at 60 mins. Please begin finalizing notes
                  and advice.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDismissTimeWarning(true)}
                className="ms-2 shrink-0 rounded-lg bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-400/30 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid w-full max-w-6xl grid-cols-1 gap-3 md:grid-cols-2">
            <VideoTile
              participant={remote}
              label={remoteLabel}
              reconnecting={remoteReconnecting}
              placeholder={
                <div className="space-y-3 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-room-button">
                    <Stethoscope className="h-8 w-8" />
                  </div>
                  <p className="text-sm">
                    {remote ? "Camera off" : liveDoctor ? "Waiting for patient..." : "Preparing room..."}
                  </p>
                </div>
              }
            />
            <VideoTile
              participant={local}
              local
              label={`${myName} (you)`}
              placeholder={
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-room-button text-2xl font-bold">
                  {myName.charAt(0).toUpperCase()}
                </div>
              }
            />
          </div>
          <RemoteAudio participant={remote} />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-room">
              <div className="space-y-3 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin" />
                <p>Connecting…</p>
              </div>
            </div>
          )}
          {roomExpired && (
            <div className="absolute inset-0 flex items-center justify-center bg-room">
              <div className="space-y-4 px-5 text-center">
                <h2 className="text-xl font-semibold">Consultation room expired</h2>
                <p className="text-sm text-white/75">
                  This consultation has ended. The old room link cannot be reused.
                </p>
                <Button variant="secondary" onClick={() => navigate("/my-visits")}>
                  My visits
                </Button>
              </div>
            </div>
          )}
          {!loading && callError && (
            <div className="absolute inset-0 flex items-center justify-center bg-room">
              <div className="space-y-4 px-5 text-center">
                <h2 className="text-xl font-semibold">Unable to connect</h2>
                <p className="text-sm text-white/75">Check your connection and return to try again.</p>
                <Button
                  variant="secondary"
                  onClick={() => navigate(liveDoctor ? "/doctor-dashboard" : `/waiting-room?id=${consultationId}`)}
                >
                  Return and try again
                </Button>
              </div>
            </div>
          )}
          {!loading && waitingForDoctor && (
            <div className="absolute inset-0 flex items-center justify-center bg-room">
              <div className="max-w-sm space-y-4 px-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-room-button">
                  <Stethoscope className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-semibold">Doctor is preparing the room</h2>
                <p className="text-sm text-white/75">Your consultation will connect as soon as your doctor is ready.</p>
                <Button variant="secondary" onClick={() => navigate(`/waiting-room?id=${consultationId}`)}>
                  Return to device check
                </Button>
              </div>
            </div>
          )}
        </main>

        {/* Chat stays mounted so messages and unread counts survive closing the drawer. */}
        <aside
          aria-label={panel === "notes" ? "Clinical notes" : "Chat"}
          className={cn(
            "absolute inset-y-16 end-2 z-20 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-room-drawer shadow-2xl sm:end-4",
            panel === "notes" ? "max-w-md sm:max-w-lg" : "max-w-sm",
            !panel && "hidden",
          )}
        >
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
            className="absolute end-3 top-3 z-30 rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className={cn("h-full", panel !== "chat" && "hidden")}>
            {joinedCall ? (
              <CallChat
                call={joinedCall}

                variant="room"
                onIncoming={() => {
                  if (panelRef.current !== "chat") setUnread((n) => n + 1);
                }}
              />
            ) : (
              <p className="p-4 text-sm text-white/70">Chat opens once you join.</p>
            )}
          </div>
          {liveDoctor && consultationId && (
            <div className={cn("h-full min-h-0", panel !== "notes" && "hidden")}>
              <PatientJournal
                consultationId={consultationId}
                canAdd
                variant="room"
                visitReason={recordReason}
                patientName={remoteLabel !== "Patient" ? remoteLabel : undefined}
              />
            </div>
          )}
        </aside>
      </div>

      <nav
        aria-label="Call controls"
        className="flex shrink-0 items-start justify-center gap-3 px-3 pb-4 pt-3 sm:gap-4"
      >
        <DockButton
          label="Cam"
          icon={camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          state={camOn ? "on" : "off"}
          onClick={() => joinedCall?.setLocalVideo(!camOn)}
        />
        <DockButton
          label="Mic"
          icon={micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          state={micOn ? "on" : "off"}
          onClick={() => joinedCall?.setLocalAudio(!micOn)}
        />
        <DockButton
          label="Blur"
          icon={<Sparkles className="h-5 w-5" />}
          state={blurOn ? "active" : "on"}
          onClick={() => void toggleBlur()}
        />
        <DockButton
          label="Chat"
          icon={<MessageSquare className="h-5 w-5" />}
          state={panel === "chat" ? "active" : "on"}
          badge={unread}
          onClick={() => togglePanel("chat")}
        />
        {liveDoctor && (
          <DockButton
            label="Notes"
            icon={<FileText className="h-5 w-5" />}
            state={panel === "notes" ? "active" : "on"}
            onClick={() => togglePanel("notes")}
          />
        )}
        <DockButton
          label="Leave"
          icon={<PhoneOff className="h-5 w-5" />}
          state="leave"
          onClick={() => setEndOpen(true)}
        />
      </nav>

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{liveDoctor ? "Leave or End consultation?" : "Leave the consultation?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {liveDoctor
                ? "You can exit to the dashboard and rejoin at any time, or permanently end the consultation for both participants."
                : "You can rejoin from your waiting room while your doctor is still in the call."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">Stay in call</AlertDialogCancel>
            {liveDoctor && (
              <Button variant="outline" onClick={exitToDashboard}>
                Exit to dashboard
              </Button>
            )}
            <AlertDialogAction
              className="bg-room-leave text-white hover:bg-room-leave-hover"
              disabled={ending}
              onClick={() => void leave()}
            >
              {liveDoctor ? "End consultation" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default VideoCall;
