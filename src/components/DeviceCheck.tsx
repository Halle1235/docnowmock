import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Square, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DeviceCheck({ onJoin, canJoin = false }: { onJoin?: () => void; canJoin?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef<number>();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const stop = () => {
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (timer.current) cancelAnimationFrame(timer.current);
    void audio.current?.close(); audio.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false); setLevel(0);
  };
  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); if (timer.current) cancelAnimationFrame(timer.current); void audio.current?.close(); }, []);
  const start = async () => {
    setBusy(true); setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.current = media; if (video.current) { video.current.srcObject = media; await video.current.play(); }
      const context = new AudioContext(); audio.current = context; await context.resume();
      const source = context.createMediaStreamSource(media); const analyser = context.createAnalyser(); analyser.fftSize = 256; source.connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => { analyser.getByteFrequencyData(samples); setLevel(Math.min(100, Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length / 128 * 100))); timer.current = requestAnimationFrame(sample); };
      sample(); setActive(true);
    } catch { stop(); setError("Camera or microphone unavailable. Check browser permissions and try again."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4">
    <div className="relative aspect-video max-w-lg bg-muted rounded-lg overflow-hidden"><video ref={video} muted playsInline className="w-full h-full object-cover" />{!active && <div className="absolute inset-0 flex items-center justify-center"><Camera className="h-10 w-10 text-muted-foreground" /></div>}</div>
    <div className="flex items-center gap-3 max-w-lg"><Mic className="h-5 w-5 text-primary" /><progress aria-label="Microphone level" max={100} value={level} className="w-full h-3 accent-primary" /><span className="text-xs text-muted-foreground w-12">{level}%</span></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={active ? stop : start}>{active ? <Square className="h-4 w-4 me-2" /> : <Camera className="h-4 w-4 me-2" />}{busy ? "Checking…" : active ? "Stop test" : "Test camera & microphone"}</Button>{onJoin && <Button disabled={!canJoin || busy} onClick={() => { stop(); onJoin(); }}><Video className="h-4 w-4 me-2" />Join call</Button>}</div>
    <p className="text-xs text-muted-foreground">Local preview · Nothing is recorded or sent</p>
  </section>;
}