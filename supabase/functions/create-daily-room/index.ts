import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { callCors, callJson, dailyRooms, isUuid, type CleanupTarget, type StoredRoom } from "../_shared/daily-rooms.ts";

interface RoomState extends StoredRoom {
  state: "forbidden" | "closed" | "waiting" | "ready" | "reserved";
  expires_at: number;
  lease: string | null;
  is_doctor: boolean;
}

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
    const body = await req.json().catch(() => null);
    if (!isUuid(body?.consultationId) || (body.action !== undefined && !["end", "join"].includes(body.action))) {
      return callJson({ error: "Invalid call request" }, 400);
    }
    const consultationId = body.consultationId;
    const server = createClient(url, serviceKey);
    const target = { _consultation_id: consultationId, _actor: actor.id };

    if (body.action === "end") {
      const closed = await server.rpc("close_bound_video_room", target);
      if (closed.error) throw new Error("Could not end the consultation");
      if (closed.data !== true) return callJson({ error: "Assigned doctor required" }, 403);
      const cleanup = await server.rpc("video_room_cleanup_targets", { _consultation_id: consultationId });
      if (cleanup.error) throw new Error("Could not load room cleanup");
      for (const room of (cleanup.data ?? []) as CleanupTarget[]) {
        if (!await dailyRooms().close(room)) return callJson({ ended: true, cleanupPending: true }, 503);
        const result = await server.rpc("mark_video_room_cleaned", {
          _consultation_id: room.consultation_id, _name: room.name,
        });
        if (result.error) throw new Error("Could not confirm room cleanup");
      }
      return callJson({ ended: true });
    }

    const getBinding = async (reserve: boolean) => {
      const result = await server.rpc("video_room_for_actor", { ...target, _reserve: reserve });
      if (result.error || !result.data) throw new Error("Could not verify call access");
      return result.data as RoomState;
    };
    let binding = await getBinding(true);
    if (binding.state === "forbidden") return callJson({ error: "Consultation access denied" }, 403);
    if (binding.state === "closed") return callJson({ error: "Consultation room is closed" }, 410);
    if (binding.state === "waiting") return callJson({ error: "Waiting for the room" }, 409);
    const daily = dailyRooms();
    if (binding.state === "reserved") {
      const created = await daily.provision(binding, binding.expires_at);
      const attach = await server.rpc("attach_bound_video_room", {
        ...target, _lease: binding.lease, _provider_id: created.id, _room_url: created.url,
      });
      if (attach.error) throw new Error("Could not save the room");
      if (attach.data !== true) return callJson({ error: "Room could not be opened" }, 409);
      binding = await getBinding(false);
    }
    if (binding.state !== "ready") return callJson({ error: "Consultation room is closed" }, 410);
    const room = await daily.lookup(binding);
    const expires = Math.min(binding.expires_at, room?.exp ?? 0);
    if (!room || expires <= Math.floor(Date.now() / 1000)) return callJson({ error: "Consultation room is closed" }, 410);
    const token = await daily.token(binding.name, actor.id, binding.is_doctor, expires);
    const current = await getBinding(false);
    if (current.state !== "ready" || current.provider_id !== binding.provider_id || current.is_doctor !== binding.is_doctor) {
      return callJson({ error: "Consultation room is closed" }, 410);
    }
    return callJson({ url: room.url, token });
  } catch {
    return callJson({ error: "Video service could not complete the request. Please retry." }, 503);
  }
});
