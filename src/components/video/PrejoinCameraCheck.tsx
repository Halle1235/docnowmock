import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, ChevronDown, Loader2, LockKeyhole, Mic, MicOff, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function deviceError(kind: string, error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return `${kind} access is blocked. Allow it in your browser's site permissions. If you are using the embedded preview, open the site in a separate tab and try again.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `${kind} not found. Connect a device or choose another one, then try again.`;
  if (name === "NotReadableError" || name === "AbortError") return `${kind} is busy or unavailable. Close other apps using it, then try again.`;
  return `${kind} could not start. Check your device and browser permissions, then try again.`;
}

export default function PrejoinCameraCheck({ name = "You", onJoin, canJoin = false }: { name?: string; onJoin?: () => void; canJoin?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const animation = useRef<number>();
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [camera, setCamera] = useState("");
  const [mic, setMic] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const release = () => {
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (animation.current !== undefined) cancelAnimationFrame(animation.current);
    animation.current = undefined;
    if (context.current) void context.current.close().catch(() => {});
    context.current = null;
    if (video.current) video.current.srcObject = null;
  };
  useEffect(() => {
    const refresh = () => { void navigator.mediaDevices?.enumerateDevices().then(value => setDevices(value)).catch(() => {}); };
    refresh(); navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => { generation.current++; release(); navigator.mediaDevices?.removeEventListener("devicechange", refresh); };
  }, []);
  const start = async (cameraId = camera, micId = mic) => {
    const request = ++generation.current;
    release(); setBusy(true); setActive(false); setHasCamera(false); setHasMic(false); setLevel(0); setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Device access is unavailable here. Open the site in a separate secure browser tab and try again. You can still join without a preview.");
        return;
      }
      // A missing or blocked camera must not prevent checking a working microphone.
      const results = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : true, audio: false }),
        navigator.mediaDevices.getUserMedia({ video: false, audio: micId ? { deviceId: { exact: micId } } : true }),
      ]);
      const media = new MediaStream(results.flatMap(result => result.status === "fulfilled" ? result.value.getTracks() : []));
      if (request !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const cameraAvailable = media.getVideoTracks().length > 0;
      const micAvailable = media.getAudioTracks().length > 0;
      setHasCamera(cameraAvailable); setHasMic(micAvailable);
      setError(results.flatMap((result, i) => result.status === "rejected" ? [deviceError(i === 0 ? "Camera" : "Microphone", result.reason)] : []).join(" "));
      media.getVideoTracks().forEach(track => { track.enabled = cameraOn; });
      media.getAudioTracks().forEach(track => { track.enabled = micOn; });
      if (video.current && cameraAvailable) { video.current.srcObject = media; await video.current.play(); }
      if (request !== generation.current) return;
      setActive(cameraAvailable || micAvailable);
      try { setDevices(await navigator.mediaDevices.enumerateDevices()); } catch { /* Labels are optional. */ }
      if (request !== generation.current) return;
      if (!micAvailable) return;
      // Meter availability is independent of successful device acquisition.
      try {
      const audio = new AudioContext(); context.current = audio; await audio.resume();
      if (request !== generation.current) return;
      const source = audio.createMediaStreamSource(media); const analyser = audio.createAnalyser(); analyser.fftSize = 256; source.connect(analyser);
      const values = new Uint8Array(analyser.fftSize);
      const sample = () => {
        if (request !== generation.current) return;
        analyser.getByteTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length);
        setLevel(Math.min(1, rms * 6)); animation.current = requestAnimationFrame(sample);
      }; sample();
      } catch { setLevel(0); }
    } catch {
      if (request === generation.current) { release(); setActive(false); setError("Camera or microphone unavailable. Allow access in your browser settings, then try again. You can still join without a preview."); }
    } finally { if (request === generation.current) setBusy(false); }
  };
  const toggle = (kind: "video" | "audio") => {
    if (!active || (kind === "video" ? !hasCamera : !hasMic)) { void start(); return; }
    const enabled = kind === "video" ? !cameraOn : !micOn;
    (kind === "video" ? stream.current?.getVideoTracks() : stream.current?.getAudioTracks())?.forEach(track => { track.enabled = enabled; });
    if (kind === "video") setCameraOn(enabled); else setMicOn(enabled);
  };
  return <section aria-label="Camera and microphone preview" className="space-y-4">
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-preview">
      <video ref={video} autoPlay muted playsInline className={`h-full w-full object-cover -scale-x-100 ${hasCamera && cameraOn ? "" : "invisible"}`} />
      {(!hasCamera || !cameraOn) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-card text-primary"><UserRound className="h-8 w-8" /></div><p className="font-semibold">{hasCamera ? "Camera is off" : "Your camera preview"}</p>{!hasCamera && <Button size="sm" disabled={busy} onClick={() => void start()}>{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Camera className="me-2 h-4 w-4" />}Enable camera & mic</Button>}</div>}
      <span className="absolute bottom-3 start-3 rounded-md bg-call/80 px-3 py-1 text-xs text-call-foreground">{name}</span>
      <span className="absolute top-3 end-3 flex items-center gap-1 rounded-md bg-card/95 px-2 py-1 text-xs text-foreground"><LockKeyhole className="h-3 w-3" />Local device check</span>
    </div>
    <div className="grid grid-cols-2 gap-3">{(["video", "audio"] as const).map(kind => {
      const isCamera = kind === "video"; const on = isCamera ? hasCamera && cameraOn : hasMic && micOn; const Icon = isCamera ? on ? Camera : CameraOff : on ? Mic : MicOff;
      return <div key={kind} className="flex min-w-0"><Button variant="outline" className="h-11 min-w-0 flex-1 gap-2 rounded-e-none px-2" disabled={busy} aria-pressed={active && on} onClick={() => toggle(kind)}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{isCamera ? "Camera" : "Mic"} {active ? on ? "on" : "off" : "off"}</span></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-11 w-10 shrink-0 rounded-s-none border-s-0 px-0" disabled={busy} aria-label={isCamera ? "Choose camera" : "Choose microphone"}><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent className="max-w-[85vw]"><DropdownMenuRadioGroup value={isCamera ? camera : mic} onValueChange={id => { if (isCamera) setCamera(id); else setMic(id); void start(isCamera ? id : camera, isCamera ? mic : id); }}><DropdownMenuRadioItem value="">Default {isCamera ? "camera" : "microphone"}</DropdownMenuRadioItem>{devices.filter(d => d.kind === (isCamera ? "videoinput" : "audioinput") && d.deviceId).map((d, i) => <DropdownMenuRadioItem key={d.deviceId} value={d.deviceId} className="max-w-[80vw] break-words">{d.label || `${isCamera ? "Camera" : "Microphone"} ${i + 1}`}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>;
    })}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Mic className="h-4 w-4 text-muted-foreground" /><div className="microphone-bars" role="meter" aria-label="Microphone input" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ height: `${4 + (hasMic && micOn ? level : 0) * (20 - Math.abs(i - 5.5) * 2)}px` }} />)}</div></div><div className="flex flex-wrap gap-2 text-xs">{[hasCamera && cameraOn ? "Camera ready" : "Camera off", hasMic && micOn ? "Microphone ready" : "Microphone off"].map(label => <span key={label} className={`flex items-center gap-1 rounded-full px-2 py-1 ${label.endsWith("ready") ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}><Check className="h-3 w-3" />{label}</span>)}</div></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">Local preview · Nothing is recorded or sent</p>
    {onJoin && <Button className="h-12 w-full" disabled={!canJoin || busy} onClick={() => { generation.current++; release(); onJoin(); }}>Join call</Button>}
  </section>;
}