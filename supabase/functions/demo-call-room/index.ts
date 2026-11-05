// Retired no-account room: never issue credentials or contact the video provider.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 return new Response(JSON.stringify({ error: "Sample calls have been removed. Sign in for an assigned consultation." }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
