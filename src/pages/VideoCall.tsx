import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DailyIframe, { type DailyCall, type DailyParticipant } from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Lock, MessageSquare, Mic, MicOff, PhoneOff, Settings, Stethoscope, Video, VideoOff, X } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import PatientJournal from "@/components/PatientJournal";
import CallChat from "@/components/CallChat";
import { cn } from "@/lib/utils";

const playable = (p: DailyParticipant | undefined, kind: "video" | "audio") => {
  const t = p?.tracks?.[kind];
  return t && t.state === "playable" ? t.persistentTrack ?? null : null;
};

function VideoTile({ participant, label, local, placeholder }: { participant?: DailyParticipant; label: string; local?: boolean; placeholder: ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = playable(participant, "video");
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  return <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-room-card shadow-2xl">
    <video ref={ref} autoPlay playsInline muted className={cn("h-full w-full object-cover", local && "-scale-x-100", !track && "hidden")} />
    {!track && <div className="absolute inset-0 flex items-center justify-center text-white/80">{placeholder}</div>}
    <span className="absolute bottom-3 start-3 rounded-lg border border-white/10 bg-black/50 px-3 py-1 text-xs font-medium text-white/95 backdrop-blur-md">{label}</span>
  </div>;
}

function RemoteAudio({ participant }: { participant?: DailyParticipant }) {
  const ref = useRef<HTMLAudioElement>(null);
  const track = playable(participant, "audio");
  useEffect(() => { if (ref.current) ref.current.srcObject = track ? new MediaStream([track]) : null; }, [track]);
  return <audio ref={ref} autoPlay />;
}

function DockButton({ label, icon, onClick, state = "on", badge }: { label: string; icon: ReactNode; onClick: () => void; state?: "on" | "active" | "off" | "leave"; badge?: number }) {
  return <div className="flex flex-col items-center gap-1">
    <button type="button" aria-label={label} onClick={onClick} className={cn("relative flex h-12 w-12 items-center justify-center rounded-xl shadow-md transition-colors",
      state === "on" && "border border-white/10 bg-room-button text-white hover:bg-room-button-hover",
      state === "active" && "bg-white font-semibold text-room-ink",
      state === "off" && "border border-destructive/30 bg-destructive/25 text-destructive-foreground",
      state === "leave" && "bg-room-leave text-white hover:bg-room-leave-hover")}>
      {icon}
      {!!badge && <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-room-leave px-1 text-[10px] font-bold text-white">{badge > 9 ? "9+" : badge}</span>}
    </button>
    <span className="text-[11px] text-white/85">{label}</span>
  </div>;
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
  const panelRef = useRef(panel); panelRef.current = panel;
  const [unread, setUnread] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordReason, setRecordReason] = useState("");
  const [roomExpired, setRoomExpired] = useState(false);
  const [liveDoctor, setLiveDoctor] = useState(false);
  const [ending, setEnding] = useState(false);
  const [callError, setCallError] = useState(false);
  const [myName, setMyName] = useState("You");

  useEffect(() => {
    if (!joinedCall) return;
    const started = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [joinedCall]);

  useEffect(() => {
    if (!consultationId) { navigate("/"); return; }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let meetingToken: string | undefined;

    const destroyExisting = async () => {
      try {
        const existing = (DailyIframe as any).getCallInstance?.();
        if (existing) { try { await existing.leave(); } catch {} try { await existing.destroy(); } catch {} }
      } catch {}
      if (callRef.current) { try { await callRef.current.destroy(); } catch {} callRef.current = null; }
    };

    const join = async (url: string) => {
      if (cancelled || (joinedUrlRef.current === url && callRef.current)) return;
      await destroyExisting();
      if (cancelled) return;
      try {
        const call = DailyIframe.createCallObject({ startAudioOff: true });
        callRef.current = call;
        joinedUrlRef.current = url;
        const sync = () => { if (!cancelled) setParticipants({ ...call.participants() }); };
        ["participant-joined", "participant-updated", "participant-left", "track-started", "track-stopped"].forEach(ev => call.on(ev as any, sync));
        call.on("left-meeting", () => {
          setJoinedCall(null);
          navigate(postCallJournal.current ? "/doctor-dashboard" : "/my-visits", { state: postCallJournal.current ? { journalId: consultationId } : null });
        });
        call.on("error", (ev: any) => toast.error(ev?.errorMsg || "Call error"));
        call.on("joined-meeting", () => { if (!cancelled) { setLoading(false); setWaitingForDoctor(false); setJoinedCall(call); sync(); } });

        const user = (await supabase.auth.getUser()).data.user;
        const { data: profile } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
        if (profile?.full_name) setMyName(profile.full_name);
        if (cancelled) { try { await call.destroy(); } catch {} callRef.current = null; joinedUrlRef.current = null; return; }
        await call.join({ url, token: meetingToken, startAudioOff: true, userName: profile?.full_name || "Participant" });
        if (cancelled) { try { await call.destroy(); } catch {} callRef.current = null; joinedUrlRef.current = null; return; }
        setLoading(false); setWaitingForDoctor(false); setJoinedCall(call); sync();
      } catch (e: any) {
        if (!cancelled) { setLoading(false); setCallError(true); }
        toast.error(e?.message || "Could not join the call");
        if (callRef.current) { try { await callRef.current.destroy(); } catch {} callRef.current = null; joinedUrlRef.current = null; }
      }
    };

    const tryStart = async () => {
      try {
        const { data: record } = await supabase.rpc("get_authorized_call_record", { _consultation_id: consultationId });
        if (!cancelled && record && typeof record === "object" && "reason_description" in record) {
          setRecordReason(String(record.reason_description || ""));
          const { data: { user } } = await supabase.auth.getUser();
          if (!cancelled) setLiveDoctor(!!user && record.doctor_id === user.id);
        }
        const { data, error } = await supabase.functions.invoke("create-daily-room", { body: { consultationId } });
        if (cancelled) return;
        if (error) {
          const ctx: any = (error as any).context;
          const status = ctx?.status;
          if (status === 410) { setRoomExpired(true); setLoading(false); return; }
          if (status === 409) { setWaitingForDoctor(true); setLoading(false); return; }
          let bodyText = "";
          try { bodyText = await ctx?.text?.(); } catch {}
          throw new Error(bodyText || error.message || "Edge function failed");
        }
        if (!data?.url) throw new Error("No room URL returned");
        meetingToken = data.token;
        await join(data.url);
      } catch (e: any) {
        if (cancelled) return;
        toast.error(e?.message || "Could not start the call");
        setLoading(false); setCallError(true);
      }
    };

    tryStart();
    channel = supabase.channel(`videocall-${consultationId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultations", filter: `id=eq.${consultationId}` }, payload => {
      if (["completed", "cancelled"].includes((payload.new as any)?.status)) { void callRef.current?.leave(); setRoomExpired(true); return; }
      const url = (payload.new as any)?.room_url;
      if (url && joinedUrlRef.current !== url) tryStart();
    }).subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (callRef.current) { try { callRef.current.destroy(); } catch {} callRef.current = null; joinedUrlRef.current = null; }
    };
  }, [consultationId, navigate]);

  const leave = async () => {
    if (ending) return;
    if (liveDoctor && consultationId) {
      postCallJournal.current = true;
      setEnding(true);
      const { error } = await supabase.functions.invoke("create-daily-room", { body: { consultationId, action: "end" } });
      setEnding(false);
      if (error) { postCallJournal.current = false; toast.error("Room closure could not be confirmed. Please retry ending the consultation."); return; }
    }
    if (callRef.current) { try { await callRef.current.leave(); } catch {} try { callRef.current.destroy(); } catch {} callRef.current = null; }
    navigate(liveDoctor ? "/doctor-dashboard" : "/my-visits", { state: postCallJournal.current ? { journalId: consultationId } : null });
  };

  const local = participants.local;
  const remote = Object.values(participants).find(p => !p.local);
  const camOn = !!local?.video;
  const micOn = !!local?.audio;
  const count = Object.keys(participants).length || 1;
  const togglePanel = (next: "chat" | "notes") => { setPanel(p => (p === next ? null : next)); if (next === "chat") setUnread(0); };
  const remoteLabel = remote?.user_name || (liveDoctor ? "Patient" : "Your doctor");
  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-room text-white">
    <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-xl font-bold tracking-tight text-white/95 sm:text-2xl">DocNow</span>
        <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/90 backdrop-blur-md">
          <Lock className="h-3.5 w-3.5" /><span className="hidden sm:inline">/consultation</span><span className="border-s border-white/20 ps-2">{count}/2</span>
          {joinedCall && <time aria-label="Call duration" className="border-s border-white/20 ps-2 font-mono tabular-nums">{timer}</time>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {liveDoctor && <button type="button" onClick={() => togglePanel("notes")} className={cn("hidden h-10 items-center gap-2 rounded-lg px-3 text-sm shadow-md sm:flex", panel === "notes" ? "bg-white font-semibold text-room-ink" : "border border-white/10 bg-room-button hover:bg-room-button-hover")}><FileText className="h-4 w-4" />Clinical Notes</button>}
        <button type="button" aria-label="Settings" title="Settings" onClick={() => toast.info("Camera and microphone can be changed from your browser's site settings.")} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-room-button shadow-md hover:bg-room-button-hover"><Settings className="h-4 w-4" /></button>
        <span aria-label={myName} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-sm font-bold text-room-ink">{myName.charAt(0).toUpperCase()}</span>
      </div>
    </header>

    <div className="flex min-h-0 flex-1">
      <main className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-3 sm:px-5">
        <div className="grid w-full max-w-6xl grid-cols-1 gap-3 md:grid-cols-2">
          <VideoTile participant={remote} label={remoteLabel} placeholder={<div className="space-y-3 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-room-button"><Stethoscope className="h-8 w-8" /></div><p className="text-sm">{remote ? "Camera off" : liveDoctor ? "Waiting for patient..." : "Preparing room..."}</p></div>} />
          <VideoTile participant={local} local label={`${myName} (you)`} placeholder={<div className="flex h-16 w-16 items-center justify-center rounded-full bg-room-button text-2xl font-bold">{myName.charAt(0).toUpperCase()}</div>} />
        </div>
        <RemoteAudio participant={remote} />
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-room"><div className="space-y-3 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p>Connecting…</p></div></div>}
        {roomExpired && <div className="absolute inset-0 flex items-center justify-center bg-room"><div className="space-y-4 px-5 text-center"><h2 className="text-xl font-semibold">Consultation room expired</h2><p className="text-sm text-white/75">This consultation has ended. The old room link cannot be reused.</p><Button variant="secondary" onClick={() => navigate("/my-visits")}>My visits</Button></div></div>}
        {!loading && callError && <div className="absolute inset-0 flex items-center justify-center bg-room"><div className="space-y-4 px-5 text-center"><h2 className="text-xl font-semibold">Unable to connect</h2><p className="text-sm text-white/75">Check your connection and return to try again.</p><Button variant="secondary" onClick={() => navigate(liveDoctor ? "/doctor-dashboard" : `/waiting-room?id=${consultationId}`)}>Return and try again</Button></div></div>}
        {!loading && waitingForDoctor && <div className="absolute inset-0 flex items-center justify-center bg-room"><div className="max-w-sm space-y-4 px-5 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-room-button"><Stethoscope className="h-8 w-8" /></div><h2 className="text-xl font-semibold">Doctor is preparing the room</h2><p className="text-sm text-white/75">Your consultation will connect as soon as your doctor is ready.</p><Button variant="secondary" onClick={() => navigate(`/waiting-room?id=${consultationId}`)}>Return to device check</Button></div></div>}
      </main>

      {/* Chat stays mounted so messages and unread counts survive closing the drawer. */}
      <aside aria-label={panel === "notes" ? "Clinical notes" : "Chat"} className={cn("absolute inset-y-16 end-2 z-20 w-[calc(100%-1rem)] max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-room-drawer/95 shadow-2xl backdrop-blur-xl sm:end-4", !panel && "hidden")}>
        <button type="button" aria-label="Close panel" onClick={() => setPanel(null)} className="absolute end-3 top-3 z-10 rounded-md p-1 text-white/70 hover:text-white"><X className="h-4 w-4" /></button>
        <div className={cn("h-full", panel !== "chat" && "hidden")}>{joinedCall ? <CallChat call={joinedCall} sample={false} variant="room" onIncoming={() => { if (panelRef.current !== "chat") setUnread(n => n + 1); }} /> : <p className="p-4 text-sm text-white/70">Chat opens once you join.</p>}</div>
        {liveDoctor && consultationId && <div className={cn("h-full overflow-y-auto bg-background text-foreground", panel !== "notes" && "hidden")}><div className="border-b p-4 pe-10"><h2 className="font-semibold">Clinical notes</h2><p className="mt-1 text-xs text-muted-foreground">Reason for visit</p><p className="text-sm break-words">{recordReason || "General consultation"}</p></div><PatientJournal consultationId={consultationId} canAdd /></div>}
      </aside>
    </div>

    <nav aria-label="Call controls" className="flex shrink-0 items-start justify-center gap-3 px-3 pb-4 pt-3 sm:gap-4">
      <DockButton label="Cam" icon={camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />} state={camOn ? "on" : "off"} onClick={() => joinedCall?.setLocalVideo(!camOn)} />
      <DockButton label="Mic" icon={micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />} state={micOn ? "on" : "off"} onClick={() => joinedCall?.setLocalAudio(!micOn)} />
      <DockButton label="Chat" icon={<MessageSquare className="h-5 w-5" />} state={panel === "chat" ? "active" : "on"} badge={unread} onClick={() => togglePanel("chat")} />
      {liveDoctor && <DockButton label="Notes" icon={<FileText className="h-5 w-5" />} state={panel === "notes" ? "active" : "on"} onClick={() => togglePanel("notes")} />}
      <DockButton label="Leave" icon={<PhoneOff className="h-5 w-5" />} state="leave" onClick={() => setEndOpen(true)} />
    </nav>

    <AlertDialog open={endOpen} onOpenChange={setEndOpen}><AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg"><AlertDialogHeader><AlertDialogTitle>{liveDoctor ? "End this consultation?" : "Leave the consultation?"}</AlertDialogTitle><AlertDialogDescription>{liveDoctor ? "This will also disconnect the patient from the call." : "You can rejoin from your waiting room while your doctor is still in the call."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Stay in call</AlertDialogCancel><AlertDialogAction className="bg-room-leave text-white hover:bg-room-leave-hover" disabled={ending} onClick={() => void leave()}>{liveDoctor ? "End consultation" : "Leave"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
};
export default VideoCall;
