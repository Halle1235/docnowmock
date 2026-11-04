import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DEMO_CALL_ID, MOCK_LOGIN_ENABLED, mockLoginDestination } from "@/lib/mock-login";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import ClinicalNotesPanel from "@/components/ClinicalNotesPanel";
import { doctorWorkspace, useDoctorWorkspace } from "@/lib/doctor-workspace";

const VideoCall = () => {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const joinedUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [waitingForDoctor, setWaitingForDoctor] = useState(false);
  const [searchParams] = useSearchParams();
  const isDemo = MOCK_LOGIN_ENABLED && consultationId === DEMO_CALL_ID;
  const demoRole: "doctor" | "patient" = searchParams.get("as") === "doctor" ? "doctor" : "patient";
  const workspace = useDoctorWorkspace();
  const visitId = searchParams.get("visit") || "sample-1";
  const sampleVisit = isDemo && demoRole === "doctor" ? workspace.visits.find(v => v.id === visitId && (v.status === "claimed" || v.status === "in_progress")) : undefined;

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
          if (isDemo && demoRole === "doctor") doctorWorkspace.finishCall(visitId);
          navigate(isDemo ? mockLoginDestination(demoRole) : "/");
        });
        frame.on("error", (ev: any) => {
          console.error("[VideoCall] Daily error event", ev);
          toast.error(ev?.errorMsg || "Call error");
        });
        frame.on("joined-meeting", () => {
          console.log("[VideoCall] joined-meeting");
          if (!cancelled) {
            if (isDemo && demoRole === "doctor") doctorWorkspace.startCall(visitId);
            setLoading(false);
            setWaitingForDoctor(false);
          }
        });

        const session = isDemo ? null : (await supabase.auth.getSession()).data.session;
        const { data: profile } = session && !isDemo
          ? await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", session.user.id)
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
          ...(isDemo ? {} : { userName: profile?.full_name || "Participant" }),
        });
        console.log("[VideoCall] join() resolved");

        if (cancelled) {
          try { await frame.destroy(); } catch {}
          callRef.current = null;
          joinedUrlRef.current = null;
          return;
        }
        // Fallback in case 'joined-meeting' didn't fire yet
        if (isDemo && demoRole === "doctor") doctorWorkspace.startCall(visitId);
        setLoading(false);
        setWaitingForDoctor(false);
      } catch (e: any) {
        console.error("[VideoCall] Daily join error", e);
        toast.error(e?.message || "Could not join the call");
        if (callRef.current) {
          try { await callRef.current.destroy(); } catch {}
          callRef.current = null;
          joinedUrlRef.current = null;
        }
      }
    };

    const tryStartDemo = async () => {
      const { data, error } = await supabase.functions.invoke("demo-call-room", { body: { role: demoRole } });
      if (cancelled) return;
      if (error) {
        if ((error as any).context?.status === 409) {
          setWaitingForDoctor(true);
          setLoading(false);
          setTimeout(() => { if (!cancelled) tryStartDemo(); }, 4000);
          return;
        }
        toast.error("Could not start the call");
        setLoading(false);
        return;
      }
      meetingToken = data.token;
      await join(data.url);
      if (demoRole === "patient" && callRef.current) {
        // When the doctor leaves, end the call for the patient too.
        callRef.current.on("participant-left", (ev) => {
          if (ev?.participant?.user_name === "Doctor (demo)") callRef.current?.leave();
        });
      }
    };

    if (isDemo) {
      tryStartDemo();
      return () => {
        cancelled = true;
        callRef.current?.destroy();
        callRef.current = null;
        joinedUrlRef.current = null;
      };
    }

    const tryStart = async () => {
      try {
        console.log("[VideoCall] Invoking create-daily-room for", consultationId);
        const { data, error } = await supabase.functions.invoke("create-daily-room", {
          body: { consultationId },
        });

        if (cancelled) return;

        if (error) {
          const ctx: any = (error as any).context;
          const status = ctx?.status;
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
        setLoading(false);
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
  }, [consultationId, navigate, isDemo, demoRole, visitId]);

  const leave = async () => {
    if (isDemo && demoRole === "doctor") doctorWorkspace.finishCall(visitId);
    if (callRef.current) {
      try { await callRef.current.leave(); } catch {}
      try { callRef.current.destroy(); } catch {}
      callRef.current = null;
    }
    navigate(isDemo ? mockLoginDestination(demoRole) : -1 as any);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Video consultation</h1>
          <Button variant="destructive" size="sm" onClick={leave}>
            <PhoneOff className="h-4 w-4 mr-2" />
            End call
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      <main className="flex-1 relative bg-muted min-h-[65vh]">
        <div ref={containerRef} className="absolute inset-0" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Connecting…</p>
            </div>
          </div>
        )}

        {!loading && waitingForDoctor && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="text-center space-y-3 max-w-sm px-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <h2 className="text-xl font-semibold">Waiting for the doctor</h2>
              <p className="text-muted-foreground text-sm">
                The call will start automatically as soon as your doctor is ready.
              </p>
            </div>
          </div>
        )}
      </main>
      {sampleVisit && <aside aria-label="In-call clinical notes" className="w-full lg:w-96 border-t lg:border-t-0 lg:border-s border-border lg:max-h-[calc(100vh-65px)] overflow-y-auto"><ClinicalNotesPanel key={sampleVisit.id} visit={sampleVisit} /></aside>}
      </div>
    </div>
  );
};

export default VideoCall;
