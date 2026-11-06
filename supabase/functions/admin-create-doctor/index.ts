const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const Body = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(10).max(128),
  license_number: z.string().trim().min(2).max(64),
  specialization: z.string().trim().min(2).max(120),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !anonKey || !serviceKey) return json({ error: "Account service is unavailable" }, 500);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, serviceKey);

    const { data: isAdmin } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) return json({ error: "Only administrators can add doctors" }, 403);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { full_name, email, password, license_number, specialization } = parsed.data;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created.user) {
      if (
        createErr?.code === "email_exists" ||
        createErr?.code === "user_already_exists" ||
        /a user with this email address has already been registered/i.test(createErr?.message ?? "")
      ) {
        return json(
          {
            code: "EMAIL_ALREADY_REGISTERED",
            error:
              "This email already has an account. Review its doctor application under Doctor verification. If no application is listed, the account holder must sign in and submit one. The existing account and password have not been changed.",
          },
          409,
        );
      }
      return json({ error: createErr?.message ?? "Could not create account" }, 400);
    }

    const { error: profileErr } = await admin.from("doctor_profiles").insert({
      user_id: created.user.id,
      license_number,
      specialization,
      is_verified: true,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: profileErr.message }, 400);
    }

    return json({ user_id: created.user.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
