import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// Demo call: real video, but no accounts and no patient records.
export default function DemoCall() {
  const [params] = useSearchParams();
  const role = params.get("as") === "doctor" ? "doctor" : "patient";
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => navigate(`/demo/${role}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("demo-call-room", { body: { role } });
      if (cancelled) return;
      if (error || !data?.url) { setError(data?.error || "Could not start the call. Please try again."); return; }
      if (!ref.current) return;
      (DailyIframe as any).getCallInstance?.()?.destroy();
      const frame = DailyIframe.createFrame(ref.current, {
        showLeaveButton: true,
        iframeStyle: { width: "100%", height: "100%", border: "0" },
      });
      callRef.current = frame;
      frame.on("left-meeting", back);
      if (role === "patient") {
        // When the doctor leaves, end the call for the patient too.
        frame.on("participant-left", (ev) => {
          if (ev?.participant?.user_name === "Doctor (demo)") frame.leave();
        });
      }
      try { await frame.join({ url: data.url, token: data.token }); }
      catch { setError("Could not join the call. Check camera and microphone permissions."); }
    })();
    return () => { cancelled = true; callRef.current?.destroy(); callRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3">
        <div>
          <p className="font-semibold">Demo consultation</p>
          <p className="text-xs text-muted-foreground">
            Joined as {role}. Open the {role === "doctor" ? "patient" : "doctor"} demo in another window to connect.
          </p>
        </div>
        <Button variant="outline" onClick={back}>End call</Button>
      </header>
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={back}>Back</Button>
        </div>
      ) : (
        <div ref={ref} className="flex-1" />
      )}
    </div>
  );
}
