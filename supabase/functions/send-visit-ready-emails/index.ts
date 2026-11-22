import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const denied = authenticateCronRequest(request);
  if (denied) return denied;

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("DOCNOW_EMAIL_FROM");
  const appUrl = Deno.env.get("DOCNOW_APP_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !from || !appUrl || !supabaseUrl || !serviceKey) {
    return new Response("Email delivery is not configured", { status: 503 });
  }
  let signIn: URL;
  try {
    signIn = new URL("/auth?as=patient", appUrl);
    if (signIn.protocol !== "https:" || signIn.username || signIn.password) throw new Error();
  } catch {
    return new Response("Invalid app URL configuration", { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase.rpc("claim_visit_ready_emails");
  if (error || !Array.isArray(data)) return new Response("Unable to read email queue", { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const { consultation_id, email } of data as { consultation_id: string; email: string }[]) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `visit-ready/${consultation_id}`,
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "You have an update from DocNow",
          text: `Sign in to DocNow to view your latest update.\n\n${signIn.href}`,
        }),
      });
      await response.body?.cancel();
      if (!response.ok) { failed++; continue; }
      const { error: saveError } = await supabase.from("visit_ready_email_queue")
        .update({ sent_at: new Date().toISOString() })
        .eq("consultation_id", consultation_id);
      if (saveError) { failed++; continue; }
      sent++;
    } catch {
      failed++;
    }
  }
  return Response.json({ sent, failed }, { status: failed ? 502 : 200 });
});
