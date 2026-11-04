import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");
    if (!DAILY_API_KEY) throw new Error("DAILY_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
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
    if (!["claimed", "in_progress"].includes(consult.status)) {
      return new Response(JSON.stringify({ error: "Consultation is not active" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
            eject_at_token_exp: true,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error("Failed to create meeting token");
      return j.token as string;
    };

    if (consult.room_url) {
      const existingName = new URL(consult.room_url).pathname.replace(/^\//, "");
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
