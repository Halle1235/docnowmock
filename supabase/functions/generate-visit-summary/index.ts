// Retired: this endpoint is permanently gone. No database access, secrets or outbound calls.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  return new Response(JSON.stringify({ error: "This endpoint has been retired." }), {
    status: 410,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
