import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { HeartPulse, Info, Loader2, PhoneOff, Stethoscope } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import PatientJournal from "@/components/PatientJournal";
import CallChat from "@/components/CallChat";
import { dailyPresentation } from "@/lib/daily-presentation";

const VideoCall = () => {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const joinedUrlRef = useRef<string | null>(null);
  const postCallJournal = useRef(false);
  const [loading, setLoading] = useState(true);
  const [waitingForDoctor, setWaitingForDoctor] = useState(false);
  const [joinedCall, setJoinedCall] = useState<DailyCall | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordReason, setRecordReason] = useState("");
  const [roomExpired, setRoomExpired] = useState(false);
  const [liveDoctor, setLiveDoctor] = useState(false);
  const [ending, setEnding] = useState(false);
  const [callError, setCallError] = useState(false);
  const doctorName = "Your doctor";
  useEffect(() => {
    if (!joinedCall) return;
    const started = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [joinedCall]);

  useEffect(() => {
    if (!consultationId) {
      navigate("/");
      return;
    }

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const ensureNoExistingInstance = async () => {
      try {
        const existing = (DailyIframe as any).getCallInstance?.();
        if (existing) {
          try { await existing.leave(); } catch {}
          try { await existing.destroy(); } catch {}
        }
      } catch (e) {
        console.warn("ensureNoExistingInstance", e);
      }
    };

    let meetingToken: string | undefined;
    const join = async (url: string) => {
      if (cancelled) return;
      if (!containerRef.current) return;
      if (joinedUrlRef.current === url && callRef.current) return;

      // Always clean up any previous instance before creating a new one
      await ensureNoExistingInstance();
      if (callRef.current) {
        try { await callRef.current.destroy(); } catch {}
        callRef.current = null;
      }
      if (cancelled) return;

      try {
        console.log("[VideoCall] Creating Daily frame for", url);
        const frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: false,
          startAudioOff: true,
          ...dailyPresentation(name => getComputedStyle(document.documentElement).getPropertyValue(name)),
          iframeStyle: {
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
            border: "0",
          },
        });
        callRef.current = frame;
        joinedUrlRef.current = url;

        frame.on("left-meeting", () => {
          setJoinedCall(null);
          navigate(postCallJournal.current ? "/doctor-dashboard" : "/my-visits", { state: postCallJournal.current ? { journalId: consultationId } : null });
        });
        frame.on("error", (ev: any) => {
          console.error("[VideoCall] Daily error event", ev);
          toast.error(ev?.errorMsg || "Call error");
        });
        frame.on("joined-meeting", () => {
          console.log("[VideoCall] joined-meeting");
          if (!cancelled) {
            setLoading(false);
            setWaitingForDoctor(false);
            setJoinedCall(frame);
          }
        });

        const user = (await supabase.auth.getUser()).data.user;
        const { data: profile } = user
          ? await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle()
          : { data: null };

        if (cancelled) {
          try { await frame.destroy(); } catch {}
          callRef.current = null;
          joinedUrlRef.current = null;
          return;
        }

        console.log("[VideoCall] Joining Daily room…");
        await frame.join({
          url,
          token: meetingToken,
          startAudioOff: true,
          userName: profile?.full_name || "Participant",
        });
        console.log("[VideoCall] join() resolved");

        if (cancelled) {
          try { await frame.destroy(); } catch {}
          callRef.current = null;
          joinedUrlRef.current = null;
          return;
        }
        // Fallback in case 'joined-meeting' didn't fire yet
        setLoading(false);
        setWaitingForDoctor(false);
        setJoinedCall(frame);
      } catch (e: any) {
        console.error("[VideoCall] Daily join error", e);
        if (!cancelled) { setLoading(false); setCallError(true); }
        toast.error(e?.message || "Could not join the call");
        if (callRef.current) {
          try { await callRef.current.destroy(); } catch {}
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
          const { data: { user } } = await supabase.auth.getUser();
          if (!cancelled) setLiveDoctor(!!user && record.doctor_id === user.id);
        }
        const { data, error } = await supabase.functions.invoke("create-daily-room", {
          body: { consultationId },
        });

        if (cancelled) return;

        if (error) {
          const ctx: any = (error as any).context;
          const status = ctx?.status;
          if (status === 410) { setRoomExpired(true); setLoading(false); return; }
          if (status === 409) {
            setWaitingForDoctor(true);
            setLoading(false);
            return;
          }
          let bodyText = "";
          try { bodyText = await ctx?.text?.(); } catch {}
          console.error("[VideoCall] Edge function error", status, bodyText, error);
          throw new Error(bodyText || error.message || "Edge function failed");
        }

        if (data?.url) {
          meetingToken = data.token;
          await join(data.url);
        } else {
          throw new Error("No room URL returned");
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("[VideoCall] tryStart error", e);
        toast.error(e?.message || "Could not start the call");
        setLoading(false); setCallError(true);
      }
    };

    tryStart();

    channel = supabase
      .channel(`videocall-${consultationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "consultations",
          filter: `id=eq.${consultationId}`,
        },
        (payload) => {
          if (["completed", "cancelled"].includes((payload.new as any)?.status)) { void callRef.current?.leave(); setRoomExpired(true); return; }
          const url = (payload.new as any)?.room_url;
          console.log("[VideoCall] Realtime update; room_url=", url);
          // Private rooms need a personal token, so fetch it via the function
          if (url && joinedUrlRef.current !== url) {
            tryStart();
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (callRef.current) {
        try { callRef.current.destroy(); } catch {}
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
      const { error } = await supabase.functions.invoke("create-daily-room", { body: { consultationId, action: "end" } });
      setEnding(false);
      if (error) { postCallJournal.current = false; toast.error("Room closure could not be confirmed. Please retry ending the consultation."); return; }
    }
    if (callRef.current) {
      try { await callRef.current.leave(); } catch {}
      try { callRef.current.destroy(); } catch {}
      callRef.current = null;
    }
    navigate(liveDoctor ? "/doctor-dashboard" : "/my-visits", { state: postCallJournal.current ? { journalId: consultationId } : null });
  };

  return <div className="h-[100dvh] min-h-0 bg-call flex flex-col">
    <header className="h-14 shrink-0 border-b border-call-border bg-call text-call-foreground">
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3"><HeartPulse className="h-6 w-6 shrink-0 text-primary" /><span className="hidden font-semibold sm:inline">DocNow</span><span className="hidden max-w-40 truncate border-s border-call-border ps-3 text-sm lg:inline">{doctorName}</span><span className="flex items-center gap-1.5 text-xs"><span className={`h-2 w-2 shrink-0 rounded-full ${joinedCall ? "bg-success motion-safe:animate-pulse" : "bg-primary"}`} /><span className="hidden sm:inline">{joinedCall ? "Live Consultation" : "Connecting"}</span></span></div>
        <div className="flex items-center gap-3"><time aria-label="Call duration" className="w-12 text-center font-mono text-sm tabular-nums">{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</time><span className="hidden text-xs text-call-foreground/70 xl:inline">Private consultation</span></div>
        <div className="flex shrink-0 items-center gap-2"><Button variant="ghost" size="sm" className="h-10 gap-1 px-2 text-call-foreground hover:bg-call-border hover:text-call-foreground" onClick={() => setDetailsOpen(true)}><Info className="h-4 w-4" />Details</Button><Button variant="destructive" size="sm" className="h-10 gap-1 px-2 sm:px-3" onClick={() => setEndOpen(true)}><PhoneOff className="h-4 w-4" />End call</Button></div>
      </div>
    </header>
    <main className="flex-1 relative bg-call min-w-0 min-h-0">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-call text-call-foreground"><div className="text-center space-y-3"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /><p>Connecting…</p></div></div>}
      {roomExpired && <div className="absolute inset-0 flex items-center justify-center bg-lounge"><div className="space-y-4 px-5 text-center"><h2 className="text-xl font-semibold">Consultation room expired</h2><p className="text-sm text-muted-foreground">This consultation has ended. The old room link cannot be reused.</p><Button onClick={() => navigate("/my-visits")}>My visits</Button></div></div>}
      {!loading && callError && <div className="absolute inset-0 flex items-center justify-center bg-lounge"><div className="space-y-4 px-5 text-center"><h2 className="text-xl font-semibold">Unable to connect</h2><p className="text-sm text-muted-foreground">Check your connection and return to try again.</p><Button variant="outline" onClick={() => navigate(liveDoctor ? "/doctor-dashboard" : `/waiting-room?id=${consultationId}`)}>Return and try again</Button></div></div>}
      {!loading && waitingForDoctor && <div className="absolute inset-0 flex items-center justify-center bg-lounge"><div className="text-center space-y-4 max-w-sm px-5"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary"><Stethoscope className="h-8 w-8" /></div><h2 className="text-xl font-semibold">Doctor is preparing the room</h2><p className="text-muted-foreground text-sm">Your consultation will connect as soon as your doctor is ready.</p><Button variant="outline" onClick={() => navigate(`/waiting-room?id=${consultationId}`)}>Return to device check</Button></div></div>}
    </main>
    <Sheet modal={false} open={detailsOpen} onOpenChange={setDetailsOpen}><SheetContent forceMount className="w-[85vw] sm:w-96 max-w-[85vw] overflow-y-auto data-[state=closed]:hidden" aria-describedby="consultation-details-description"><SheetHeader className="text-start"><SheetTitle>Consultation details</SheetTitle><SheetDescription id="consultation-details-description">Your consultation</SheetDescription></SheetHeader><div className="my-6 space-y-5 border-y py-5"><div><p className="text-xs text-muted-foreground">Patient</p><p className="mt-1 font-medium">Consultation participant</p><p className="mt-1 text-xs text-muted-foreground">UAE PASS not linked</p></div><div><p className="text-xs text-muted-foreground">Doctor</p><p className="mt-1 font-medium">{doctorName}</p></div><div><p className="text-xs text-muted-foreground">Reason for visit</p><p className="mt-1 break-words text-sm">{recordReason || "General consultation"}</p></div></div>{joinedCall && <CallChat call={joinedCall} sample={false} />}{liveDoctor && consultationId && <PatientJournal consultationId={consultationId} canAdd />}</SheetContent></Sheet>
    <AlertDialog open={endOpen} onOpenChange={setEndOpen}><AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg"><AlertDialogHeader><AlertDialogTitle>{liveDoctor ? "End this consultation?" : `End consultation with ${doctorName}?`}</AlertDialogTitle><AlertDialogDescription>{liveDoctor ? "This will also disconnect the patient from the call." : "You will leave the video consultation."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Stay in call</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void leave()}>End consultation</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
};
export default VideoCall;
