// Retired no-account room: never issue credentials or contact the video provider.
import { corsHeaders } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "Sample calls have been removed. Sign in for an assigned consultation." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
