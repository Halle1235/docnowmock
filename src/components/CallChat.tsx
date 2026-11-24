import { useEffect, useRef, useState } from "react";
import { type DailyCall } from "@daily-co/daily-js";
import { Download, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deliverFile } from "@/lib/file-download";
import { MAX_CHAT_CHARACTERS, validCallFileContent, validCallFileMetadata } from "@/lib/call-sharing";

interface Message { id: string; at: number; sender: string; text?: string; file?: Blob; name?: string }
interface Transfer { name: string; type: string; size: number; chunks: ArrayBuffer[]; received: number }
export default function CallChat({ call, variant, onIncoming }: { call: DailyCall; variant?: "room"; onIncoming?: () => void }) {
  const room = variant === "room";
  const incoming = useRef(onIncoming); incoming.current = onIncoming;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const add = (message: Omit<Message, "id" | "at">) => { if (message.sender !== "You") incoming.current?.(); setMessages(current => [...current.slice(-99), { ...message, id: crypto.randomUUID(), at: Date.now() }]); };
  useEffect(() => {
    let closed = false;
    let remoteId = "";
    let transfer: Transfer | null = null;
    let signalParts: string[] = [];
    let signalSize = 0;
    let signalTimer: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const sendSignal = (description: RTCSessionDescriptionInit) => {
      const raw = JSON.stringify(description); const count = Math.ceil(raw.length / 1800);
      if (count > 40 || !remoteId) return;
      for (let index = 0; index < count; index++) call.sendAppMessage({ kind: "docnow-signal", index, count, part: raw.slice(index * 1800, (index + 1) * 1800) }, remoteId);
    };
    const bind = (data: RTCDataChannel) => {
      channel.current = data; data.binaryType = "arraybuffer";
      data.onopen = () => { if (!closed) { setConnected(true); setError(""); } if (timeout) clearTimeout(timeout); };
      data.onclose = () => { if (!closed) setConnected(false); transfer = null; };
      data.onmessage = async event => {
        if (closed) return;
        if (typeof event.data === "string") {
          try {
            const meta = JSON.parse(event.data);
            if (meta.kind === "file" && validCallFileMetadata(meta.name, meta.type, meta.size)) { transfer = { ...meta, chunks: [], received: 0 }; }
          } catch { transfer = null; }
          return;
        }
        if (!(event.data instanceof ArrayBuffer) || !transfer || event.data.byteLength > 16384) return;
        transfer.received += event.data.byteLength;
        if (transfer.received > transfer.size) { transfer = null; setError("Invalid file rejected"); return; }
        transfer.chunks.push(event.data);
        if (transfer.received === transfer.size) {
          const completed = transfer; transfer = null;
          const blob = new Blob(completed.chunks, { type: completed.type });
          if (await validCallFileContent(blob)) { if (!closed) add({ sender: "Other participant", file: blob, name: completed.name }); }
          else if (!closed) setError("File content did not match its type");
        }
      };
    };
    const setup = async (initiator: boolean, id: string) => {
      if (peer.current || closed) return;
      remoteId = id;
      const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
      peer.current = connection;
      connection.ondatachannel = event => bind(event.channel);
      connection.onicecandidate = event => { if (!event.candidate && connection.localDescription && !closed) sendSignal(connection.localDescription.toJSON()); };
      timeout = setTimeout(() => { if (!closed && channel.current?.readyState !== "open") setError("Direct file sharing could not connect on this network. Chat remains available."); }, 20000);
      if (initiator) { bind(connection.createDataChannel("docnow-files")); await connection.setLocalDescription(await connection.createOffer()); }
    };
    const participants = () => {
      const all = Object.values(call.participants()); const local = all.find(p => p.local); const other = all.find(p => !p.local);
      if (local && other) void setup(local.session_id.localeCompare(other.session_id) < 0, other.session_id).catch(() => setError("Direct sharing unavailable"));
    };
    const receive = async (event: { data: unknown; fromId: string }) => {
      if (closed || !Object.values(call.participants()).some(p => !p.local && p.session_id === event.fromId)) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || typeof message !== "object") return;
      if (message.kind === "docnow-chat" && typeof message.text === "string" && message.text.trim() && message.text.length <= MAX_CHAT_CHARACTERS) add({ sender: "Other participant", text: message.text });
      if (message.kind !== "docnow-signal" || typeof message.part !== "string" || message.part.length > 1800 || !Number.isInteger(message.index) || !Number.isInteger(message.count)) return;
      const index = Number(message.index), count = Number(message.count);
      if (count < 1 || count > 40 || index < 0 || index >= count) return;
      if (remoteId && remoteId !== event.fromId) return;
      if (index === 0) { signalParts = new Array(count); signalSize = 0; if (signalTimer) clearTimeout(signalTimer); signalTimer = setTimeout(() => { signalParts = []; signalSize = 0; }, 10000); }
      if (signalParts.length !== count) return;
      if (!signalParts[index]) signalSize++; signalParts[index] = message.part;
      if (signalSize !== count) return;
      try {
        const signal = JSON.parse(signalParts.join("")); signalParts = []; signalSize = 0;
        if (!["offer", "answer"].includes(signal.type) || typeof signal.sdp !== "string" || signal.sdp.length > 70000) return;
        await setup(false, event.fromId);
        const connection = peer.current; if (!connection) return;
        await connection.setRemoteDescription(signal);
        if (signal.type === "offer") await connection.setLocalDescription(await connection.createAnswer());
      } catch { if (!closed) setError("Direct sharing connection failed"); }
    };
    call.on("app-message", receive); call.on("participant-joined", participants); participants();
    return () => { closed = true; call.off("app-message", receive); call.off("participant-joined", participants); if (timeout) clearTimeout(timeout); if (signalTimer) clearTimeout(signalTimer); channel.current?.close(); peer.current?.close(); channel.current = null; peer.current = null; };
  }, [call]);
  const send = () => {
    if (!text.trim() || text.length > MAX_CHAT_CHARACTERS) return;
    try { call.sendAppMessage({ kind: "docnow-chat", text: text.trim() }, "*"); add({ sender: "You", text: text.trim() }); setText(""); }
    catch { setError("Message could not be sent"); }
  };
  const share = async () => {
    const data = channel.current; const file = pendingFile;
    if (!data || data.readyState !== "open" || !file) return;
    setBusy(true);
    try {
      if (!validCallFileMetadata(file.name, file.type, file.size) || !await validCallFileContent(file)) throw new Error("Choose a valid JPG, PNG or PDF up to 2 MB");
      data.send(JSON.stringify({ kind: "file", name: file.name, type: file.type, size: file.size }));
      const bytes = await file.arrayBuffer();
      for (let offset = 0; offset < bytes.byteLength; offset += 16384) {
        while (data.bufferedAmount > 262144) { await new Promise(resolve => setTimeout(resolve, 50)); if (data.readyState !== "open") throw new Error("Transfer connection closed"); }
        data.send(bytes.slice(offset, offset + 16384));
      }
      add({ sender: "You", file, name: file.name }); setPendingFile(null);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "File could not be shared"); }
    finally { setBusy(false); }
  };
  return <section className={room ? "flex h-full min-h-0 flex-col gap-3 p-4 text-white/95" : "p-4 space-y-4 min-w-0"} aria-label="Call chat"><h2 className={room ? "text-base font-semibold" : "text-lg font-semibold"}>{room ? "Chat" : "Chat & files"}</h2><div className={room ? "min-h-0 flex-1 overflow-y-auto space-y-3 py-2" : "h-64 overflow-y-auto space-y-3 border-y py-3"} aria-live="polite">{messages.length ? messages.map(message => room ? <div key={message.id} className={`flex flex-col gap-1 ${message.sender === "You" ? "items-end" : "items-start"}`}><span className="text-[10px] text-white/60">{message.sender} · {new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><div className={`max-w-[85%] break-words px-3 py-2 text-xs ${message.sender === "You" ? "rounded-2xl rounded-tr-sm bg-room-bubble text-white" : "rounded-2xl rounded-tl-sm border border-white/10 bg-black/30 text-white/95"}`}>{message.text && <p className="whitespace-pre-wrap">{message.text}</p>}{message.file && <div className="space-y-1"><p>{message.name}</p><Button variant="secondary" size="sm" onClick={() => { if (message.file) void deliverFile(message.file, message.name ?? "shared-file"); }}><Download className="h-4 w-4 me-2" />Save file</Button></div>}</div></div> : <div key={message.id} className="text-sm break-words"><strong>{message.sender}</strong>{message.text && <p className="whitespace-pre-wrap">{message.text}</p>}{message.file && <div className="mt-1"><p>{message.name}</p><Button variant="outline" size="sm" onClick={() => { if (message.file) void deliverFile(message.file, message.name ?? "shared-file"); }}><Download className="h-4 w-4 me-2" />Save file</Button></div>}</div>) : <p className={room ? "text-xs text-white/60" : "text-sm text-muted-foreground"}>No messages yet</p>}</div><form className="flex gap-2" onSubmit={e => { e.preventDefault(); send(); }}><Input aria-label="Chat message" value={text} maxLength={MAX_CHAT_CHARACTERS} onChange={e => setText(e.target.value)} placeholder={room ? "Type a message..." : "Message"} className={room ? "border-white/10 bg-black/20 text-white placeholder:text-white/50" : undefined} /><Button type="submit" size="icon" aria-label="Send message" title="Send message" disabled={!text.trim()}><Send className="h-4 w-4" /></Button></form><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,application/pdf" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file && validCallFileMetadata(file.name, file.type, file.size)) { setError(""); setPendingFile(file); } else setError("Choose a JPG, PNG or PDF up to 2 MB"); }} /><Button variant={room ? "secondary" : "outline"} disabled={!connected || busy} onClick={() => fileInput.current?.click()}><Paperclip className="h-4 w-4 me-2" />Attach photo or PDF</Button>{pendingFile && <div className="space-y-2"><p className="text-sm break-words">{pendingFile.name} · {Math.ceil(pendingFile.size / 1024)} KB</p><div className="flex gap-2"><Button size="sm" disabled={busy || !connected} onClick={share}>{busy ? "Sending…" : "Send file"}</Button><Button size="icon" variant="ghost" aria-label="Cancel attachment" title="Cancel attachment" disabled={busy} onClick={() => setPendingFile(null)}><X className="h-4 w-4" /></Button></div></div>}<p className={room ? "text-[10px] text-white/60" : "text-xs text-muted-foreground"}>{connected ? "Direct sharing connected · JPG, PNG or PDF · 2 MB max" : "File sharing connects when both participants join"} · Files are not stored</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</section>;
}