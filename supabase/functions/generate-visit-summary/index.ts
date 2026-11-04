import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "diagnosis", "treatment_plan", "medications", "self_care", "warning_signs", "follow_up"],
  properties: {
    overview: { type: "string" },
    diagnosis: { type: "string" },
    treatment_plan: { type: "array", items: { type: "string" } },
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "instructions"],
        properties: { name: { type: "string" }, instructions: { type: "string" } },
      },
    },
    self_care: { type: "array", items: { type: "string" } },
    warning_signs: { type: "array", items: { type: "string" } },
    follow_up: { type: "string" },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const consultationId = String(body.consultationId || "");
    const notes = String(body.notes || "").trim();
    const language = body.language === "ar" ? "Arabic" : "English";
    if (!/^[0-9a-f-]{36}$/i.test(consultationId)) return json({ error: "Invalid consultationId" }, 400);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: consult, error: consultError } = await userClient.rpc("get_authorized_call_record", { _consultation_id: consultationId });
    if (consultError || !consult) return json({ error: "Consultation access denied" }, 403);
    if (consult.doctor_id !== userData.user.id) return json({ error: "Only the assigned doctor can do this" }, 403);

    if (body.action === "approve") {
      const { data: draft, error: draftError } = await userClient.rpc("get_authorized_summary_draft", { _consultation_id: consultationId });
      if (draftError) return json({ error: "Draft access denied" }, 403);
      if (!draft) return json({ error: "There is no summary waiting for review." }, 400);
      const { error: apErr } = await userClient.from("consultations").update({
        visit_summary: draft,
        visit_summary_approved_at: new Date().toISOString(),
        visit_summary_approved_by: userData.user.id,
      }).eq("id", consultationId);
      if (apErr) return json({ error: "Could not approve summary" }, 500);
      const { error: deleteError } = await userClient.from("visit_summary_drafts").delete().eq("consultation_id", consultationId);
      if (deleteError) return json({ error: "Could not clear approved draft" }, 500);
      return json({ summary: draft, approved: true }, 200);
    }

    if (notes.length < 10) return json({ error: "Please write more detailed notes first." }, 400);
    if (notes.length > 10000) return json({ error: "Notes are too long (max 10,000 characters)." }, 400);

    const prompt = `You write patient-friendly visit summaries for a telemedicine clinic in the UAE.
Rewrite the doctor's clinical notes into plain ${language} a non-medical patient understands (reading level ~grade 8).
Rules: only use facts in the notes; never invent diagnoses, doses or medications; if something is not mentioned use an empty list or "Not discussed". Keep each list item under 25 words. Warning signs should tell the patient when to seek urgent care (call 998 in an emergency).

Patient's stated reason: ${consult.reason_category ?? "n/a"} — ${consult.reason_description ?? ""}
Prescription field: ${consult.prescription ?? "none"}
Doctor's notes:
"""
${notes}
"""`;

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: prompt,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "visit_summary", strict: true, schema: SCHEMA } },
      }),
    });

    const runId = upstream.headers.get("X-Lovable-AIG-Run-ID");
    const extra: Record<string, string> = runId ? { "X-Lovable-AIG-Run-ID": runId } : {};

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "");
      console.error("Gateway error", upstream.status, t);
      let msg = "AI request failed";
      try { msg = JSON.parse(t)?.error?.message || JSON.parse(t)?.message || msg; } catch {}
      if (upstream.status === 429) msg = "Too many requests, please try again in a moment.";
      if (upstream.status === 402) msg = "AI credits are used up. Please add credits in workspace billing.";
      return json({ error: msg }, upstream.status, extra);
    }

    // Parse SSE
    const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "", text = "", streamErr = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "error" || ev.type === "response.failed")
            streamErr = ev.error?.message || ev.response?.error?.message || "AI stream failed";
          else if (ev.type === "response.refusal.delta") streamErr = "The AI declined to summarise these notes.";
        } catch {}
      }
    }
    if (streamErr) return json({ error: streamErr }, 502, extra);
    if (!text.trim()) return json({ error: "The AI returned an empty summary." }, 502, extra);

    let summary: unknown;
    try { summary = JSON.parse(text); } catch { return json({ error: "Could not read AI summary" }, 502, extra); }

    // Save as a private draft; patients only see it after the doctor approves it
    const now = new Date().toISOString();
    const { error: draftErr } = await userClient
      .from("visit_summary_drafts")
      .upsert({ consultation_id: consultationId, summary, generated_at: now });
    if (draftErr) return json({ error: "Could not save summary draft" }, 500);
    const { error: updErr } = await userClient
      .from("consultations")
      .update({ notes, visit_summary_generated_at: now })
      .eq("id", consultationId);
    if (updErr) return json({ error: "Could not save notes" }, 500);

    return json({ summary, approved: false }, 200, extra);
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(msg);
    return json({ error: msg }, 500);
  }
});
