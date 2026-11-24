import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, CameraOff, Check, ChevronDown, Loader2, LockKeyhole, Mic, MicOff, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function deviceErrorKey(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "notFound";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unavailable";
}

export default function PrejoinCameraCheck({ name, onJoin, canJoin = false }: { name?: string; onJoin?: () => void; canJoin?: boolean }) {
  const { t, i18n } = useTranslation();
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
    let mounted = true;
    const refresh = () => { void navigator.mediaDevices?.enumerateDevices().then(value => { if (mounted) setDevices(value); }).catch(() => {}); };
    refresh(); navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => { mounted = false; generation.current++; release(); navigator.mediaDevices?.removeEventListener("devicechange", refresh); };
  }, []);
  const start = async (cameraId = camera, micId = mic) => {
    const request = ++generation.current;
    release(); setBusy(true); setActive(false); setHasCamera(false); setHasMic(false); setLevel(0); setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("deviceCheck.noAccess"));
        return;
      }
      const media = new MediaStream();
      stream.current = media;
      const acquire = async (constraints: MediaStreamConstraints) => {
        const acquired = await navigator.mediaDevices.getUserMedia(constraints);
        for (const track of acquired.getTracks()) {
          if (request === generation.current) media.addTrack(track);
          else track.stop();
        }
      };
      const results = await Promise.allSettled([
        acquire({ video: cameraId ? { deviceId: { exact: cameraId } } : true, audio: false }),
        acquire({ video: false, audio: micId ? { deviceId: { exact: micId } } : true }),
      ]);
      if (request !== generation.current) return;
      const cameraAvailable = media.getVideoTracks().length > 0;
      const micAvailable = media.getAudioTracks().length > 0;
      setHasCamera(cameraAvailable); setHasMic(micAvailable);
      setError(results.flatMap((result, i) => result.status === "rejected" ? [
        t(`deviceCheck.${deviceErrorKey(result.reason)}`, { device: t(i === 0 ? "deviceCheck.camera" : "deviceCheck.microphone") }),
      ] : []).join(" "));
      media.getVideoTracks().forEach(track => { track.enabled = cameraOn; });
      media.getAudioTracks().forEach(track => { track.enabled = micOn; });
      if (video.current && cameraAvailable) {
        video.current.srcObject = media;
        void video.current.play().catch(() => {
          if (request === generation.current) setError(current => [current, t("deviceCheck.previewError")].filter(Boolean).join(" "));
        });
      }
      if (request !== generation.current) return;
      setActive(cameraAvailable || micAvailable);
      try {
        const detected = await navigator.mediaDevices.enumerateDevices();
        if (request === generation.current) setDevices(detected);
      } catch { /* Labels are optional. */ }
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
      if (request === generation.current) { release(); setActive(false); setError(t("deviceCheck.noAccess")); }
    } finally { if (request === generation.current) setBusy(false); }
  };
  const toggle = (kind: "video" | "audio") => {
    if (!active || (kind === "video" ? !hasCamera : !hasMic)) { void start(); return; }
    const enabled = kind === "video" ? !cameraOn : !micOn;
    (kind === "video" ? stream.current?.getVideoTracks() : stream.current?.getAudioTracks())?.forEach(track => { track.enabled = enabled; });
    if (kind === "video") setCameraOn(enabled); else setMicOn(enabled);
  };
  return <section aria-label={t("deviceCheck.label")} className="space-y-4">
    <div className="relative aspect-video min-h-44 w-full overflow-hidden rounded-lg bg-preview">
      <video ref={video} autoPlay muted playsInline className={`absolute inset-0 h-full w-full object-cover -scale-x-100 ${hasCamera && cameraOn ? "" : "invisible"}`} />
      {(!hasCamera || !cameraOn) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <div className="grid size-10 place-items-center rounded-full bg-card text-primary sm:size-14"><UserRound className="size-5 sm:size-7" /></div>
          <p className="text-sm font-semibold">{t(hasCamera ? "deviceCheck.cameraOff" : "deviceCheck.preview")}</p>
          {!hasCamera && <Button size="sm" disabled={busy} onClick={() => void start()}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Camera aria-hidden="true" />}
            {t("deviceCheck.enable")}
          </Button>}
        </div>
      )}
      {hasCamera && <span className="absolute bottom-3 start-3 rounded-md bg-call/80 px-3 py-1 text-xs text-call-foreground">{name ?? t("lounge.you")}</span>}
      <span className="absolute top-2 end-2 flex items-center gap-1 rounded-md bg-card/95 px-2 py-1 text-xs text-foreground"><LockKeyhole aria-hidden="true" className="h-3 w-3" />{t("deviceCheck.local")}</span>
    </div>
    <div className="grid grid-cols-2 gap-3">{(["video", "audio"] as const).map(kind => {
      const isCamera = kind === "video"; const on = isCamera ? hasCamera && cameraOn : hasMic && micOn; const Icon = isCamera ? on ? Camera : CameraOff : on ? Mic : MicOff;
      const label = t(isCamera ? "deviceCheck.camera" : "deviceCheck.mic");
      return (
        <div key={kind} className="flex min-w-0">
          <Button variant="outline" className="h-11 min-w-0 flex-1 gap-1 rounded-e-none px-2" disabled={busy} aria-pressed={active && on} onClick={() => toggle(kind)}>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span>
          </Button>
          <DropdownMenu dir={i18n.dir()}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 w-9 shrink-0 rounded-s-none border-s-0 px-0" disabled={busy} aria-label={t(isCamera ? "deviceCheck.chooseCamera" : "deviceCheck.chooseMic")}><ChevronDown aria-hidden="true" className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-w-[85vw]">
              <DropdownMenuRadioGroup value={isCamera ? camera : mic} onValueChange={id => {
                if (isCamera) setCamera(id); else setMic(id);
                void start(isCamera ? id : camera, isCamera ? mic : id);
              }}>
                <DropdownMenuRadioItem value="">{t(isCamera ? "deviceCheck.defaultCamera" : "deviceCheck.defaultMic")}</DropdownMenuRadioItem>
                {devices.filter(device => device.kind === (isCamera ? "videoinput" : "audioinput") && device.deviceId).map((device, i) => (
                  <DropdownMenuRadioItem key={device.deviceId} value={device.deviceId} className="max-w-[80vw] break-words">
                    {device.label || `${label} ${i + 1}`}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    })}</div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Mic aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <div className="microphone-bars" role="meter" aria-label={t("deviceCheck.micInput")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ height: `${4 + (hasMic && micOn ? level : 0) * (20 - Math.abs(i - 5.5) * 2)}px` }} />)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {([
          [hasCamera && cameraOn, "cameraReady", "cameraOff"],
          [hasMic && micOn, "micReady", "micOff"],
        ] as const).map(([on, enabled, disabled]) => (
          <span key={enabled} className={`flex items-center gap-1 rounded-full px-2 py-1 ${on ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
            {on && <Check aria-hidden="true" className="h-3 w-3" />}
            {t(`deviceCheck.${on ? enabled : disabled}`)}
          </span>
        ))}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">{t("deviceCheck.privacy")}</p>
    {onJoin && <Button className="h-12 w-full" disabled={!canJoin || busy} onClick={() => { generation.current++; release(); onJoin(); }}>{t("lounge.join")}</Button>}
  </section>;
}
