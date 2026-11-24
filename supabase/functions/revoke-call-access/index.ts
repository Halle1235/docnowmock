import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { callCors, callJson, dailyRooms, isUuid, type CleanupTarget } from "../_shared/daily-rooms.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: callCors });
  if (req.method !== "POST") return callJson({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Video service is not configured");
    const authorization = req.headers.get("Authorization");
    if (!authorization) return callJson({ error: "Sign in required" }, 401);
    const user = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user: actor }, error: authError } = await user.auth.getUser();
    if (authError || !actor) return callJson({ error: "Sign in required" }, 401);
    const server = createClient(url, serviceKey);
    const { data: admin, error: roleError } = await server.rpc("has_role", { _user_id: actor.id, _role: "admin" });
    if (roleError || admin !== true) return callJson({ error: "Administrator required" }, 403);
    const body = await req.json().catch(() => null);
    if (!isUuid(body?.doctorId)) return callJson({ error: "Invalid doctor ID" }, 400);
    const cancelled = await user.rpc("admin_close_revoked_doctor_visits", { _user_id: body.doctorId });
    if (cancelled.error) throw new Error("Could not close affected consultations");
    const targets = await server.rpc("video_room_cleanup_targets", { _doctor_id: body.doctorId });
    if (targets.error) throw new Error("Could not load room cleanup");
    let closed = 0;
    for (const room of (targets.data ?? []) as CleanupTarget[]) {
      try {
        if (!await dailyRooms().close(room)) continue;
        const saved = await server.rpc("mark_video_room_cleaned", {
          _consultation_id: room.consultation_id, _name: room.name,
        });
        if (saved.data === true) closed++;
      } catch {
        // Leave this room pending and keep processing the doctor's other rooms.
      }
    }
    const pending = await server.rpc("video_room_cleanup_pending", { _doctor_id: body.doctorId });
    if (pending.error) throw new Error("Could not confirm room cleanup");
    return callJson({ closed, pending: pending.data === true });
  } catch {
    return callJson({ error: "Room cleanup could not be confirmed. Please retry." }, 503);
  }
});
