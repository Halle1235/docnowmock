import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");
    if (!DAILY_API_KEY) throw new Error("DAILY_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!SUPABASE_URL) throw new Error("Backend not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const consultationId = String(body.consultationId || "");
    if (!consultationId || !/^[0-9a-f-]{36}$/i.test(consultationId)) {
      return new Response(JSON.stringify({ error: "Invalid consultationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: consult, error: consultErr } = await userClient.rpc("get_authorized_call_record", { _consultation_id: consultationId });

    if (consultErr || !consult) {
      return new Response(JSON.stringify({ error: "Consultation not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (consult.doctor_id !== userData.user.id && consult.patient_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isDoctor = consult.doctor_id === userData.user.id;
    const roomNameFromUrl = (url: string) => {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".daily.co") || !/^\/[a-zA-Z0-9_-]+$/.test(parsed.pathname)) throw new Error("Invalid room URL");
      return parsed.pathname.slice(1);
    };
    if (body.action === "end") {
      if (!isDoctor) return new Response(JSON.stringify({ error: "Only the assigned doctor may end the consultation" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Close authorization first. If provider cleanup fails, retries cannot reopen the visit.
      if (!["completed", "cancelled"].includes(consult.status)) {
        const { error } = await userClient.from("consultations").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", consultationId);
        if (error) throw new Error("Could not end consultation");
      }
      if (consult.room_url) {
        const name = roomNameFromUrl(consult.room_url);
        const expired = await fetch(`https://api.daily.co/v1/rooms/${name}`, {
          method: "POST", headers: { Authorization: `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { exp: Math.floor(Date.now() / 1000), eject_at_room_exp: true } }),
        });
        await expired.text();
        if (!expired.ok && expired.status !== 404) throw new Error("Consultation ended, but room cleanup failed. Retry ending the call.");
        const deleted = await fetch(`https://api.daily.co/v1/rooms/${name}`, { method: "DELETE", headers: { Authorization: `Bearer ${DAILY_API_KEY}` } });
        await deleted.text();
        if (!deleted.ok && deleted.status !== 404) throw new Error("Consultation ended, but room cleanup failed. Retry ending the call.");
      }
      return new Response(JSON.stringify({ ended: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.action && body.action !== "join") return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!["claimed", "in_progress"].includes(consult.status)) {
      return new Response(JSON.stringify({ error: "Consultation is not active" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const makeToken = async (roomName: string) => {
      const r = await fetch("https://api.daily.co/v1/meeting-tokens", {
        method: "POST",
        headers: { Authorization: `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_id: userData.user.id,
            is_owner: isDoctor,
            exp: Math.floor(Date.now() / 1000) + 60 * 60,
            eject_at_token_exp: true,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error("Failed to create meeting token");
      return j.token as string;
    };

    if (consult.room_url) {
      const existingName = roomNameFromUrl(consult.room_url);
      const roomResponse = await fetch(`https://api.daily.co/v1/rooms/${existingName}`, { headers: { Authorization: `Bearer ${DAILY_API_KEY}` } });
      const room = await roomResponse.json();
      if (roomResponse.status === 404 || (roomResponse.ok && Number(room.config?.exp) > 0 && Number(room.config.exp) <= Math.floor(Date.now() / 1000))) return new Response(JSON.stringify({ error: "Consultation room has expired" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!roomResponse.ok) throw new Error("Could not verify room availability");
      const token = await makeToken(existingName);
      return new Response(JSON.stringify({ url: consult.room_url, token }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only the doctor may create the room
    if (consult.doctor_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Waiting for doctor to start the call" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 2; // 2 hours
    const roomName = `consult-${consultationId.slice(0, 8)}-${Date.now().toString(36)}`;

    const dailyResp = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          exp,
          eject_at_room_exp: true,
          enable_chat: true,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    const dailyData = await dailyResp.json();
    if (!dailyResp.ok) {
      console.error("Daily error", dailyData);
      return new Response(JSON.stringify({ error: "Failed to create room", details: dailyData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = dailyData.url as string;

    const { error: updErr } = await userClient
      .from("consultations")
      .update({ room_url: url, status: "in_progress" })
      .eq("id", consultationId);

    if (updErr) {
      throw new Error("Could not save the call room");
    }

    const token = await makeToken(dailyData.name);
    return new Response(JSON.stringify({ url, token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
