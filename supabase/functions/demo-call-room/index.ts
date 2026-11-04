// Temporary demo video call: no accounts, no database access, one shared short-lived room.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const ROOM = "docnow-demo";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const key = Deno.env.get("DAILY_API_KEY");
    if (!key) throw new Error("DAILY_API_KEY not configured");
    const h = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const body = await req.json().catch(() => ({}));
    const role = body.role === "doctor" ? "doctor" : "patient";
    const now = Math.floor(Date.now() / 1000);

    let room = await fetch(`https://api.daily.co/v1/rooms/${ROOM}`, { headers: h });
    let data = room.ok ? await room.json() : null;
    const exp = data?.config?.exp as number | undefined;
    if (data && exp && exp < now + 300) {
      await fetch(`https://api.daily.co/v1/rooms/${ROOM}`, { method: "DELETE", headers: h });
      data = null;
    }
    if (!data) {
      room = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST", headers: h,
        body: JSON.stringify({
          name: ROOM, privacy: "private",
          properties: { exp: now + 3600, max_participants: 2, enable_chat: true, enable_screenshare: true },
        }),
      });
      data = await room.json();
      if (!room.ok) { console.error("Daily room error", data); return json({ error: "Could not create the call room" }, 502); }
    }

    const t = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST", headers: h,
      body: JSON.stringify({ properties: {
        room_name: ROOM, user_name: role === "doctor" ? "Doctor (demo)" : "Patient (demo)",
        is_owner: false, exp: now + 3600, eject_at_token_exp: true,
      } }),
    });
    const tj = await t.json();
    if (!t.ok) { console.error("Daily token error", tj); return json({ error: "Could not join the call" }, 502); }
    return json({ url: data.url, token: tj.token });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
