import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Admin-only: eject a doctor whose access was withdrawn from every active consultation room.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!DAILY_API_KEY || !SUPABASE_URL || !SERVICE_KEY) throw new Error("Backend not configured");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const doctorId = String(body.doctorId || "");
    if (!/^[0-9a-f-]{36}$/i.test(doctorId)) return json({ error: "Invalid doctorId" }, 400);

    // Only eject if the doctor really lacks access now.
    const [{ data: role }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", doctorId).eq("role", "doctor").maybeSingle(),
      admin.from("doctor_profiles").select("is_verified").eq("user_id", doctorId).maybeSingle(),
    ]);
    if (role && profile?.is_verified === true) return json({ ejected: 0, skipped: "Doctor still has access" });

    const { data: visits, error } = await admin.from("consultations").select("room_url").eq("doctor_id", doctorId).in("status", ["claimed", "in_progress"]).not("room_url", "is", null);
    if (error) throw error;
    let ejected = 0;
    for (const v of visits ?? []) {
      const name = new URL(v.room_url as string).pathname.replace(/^\//, "");
      if (!/^[A-Za-z0-9_-]+$/.test(name)) continue;
      const r = await fetch(`https://api.daily.co/v1/rooms/${name}/eject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: [doctorId] }),
      });
      await r.text();
      if (r.ok) ejected++;
      else if (r.status !== 404) throw new Error("Could not remove the doctor from an active call");
    }
    return json({ ejected });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
