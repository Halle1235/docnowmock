export interface StoredRoom {
  name: string;
  provider_id: string | null;
}

export interface CleanupTarget extends StoredRoom {
  consultation_id: string;
  lease_active: boolean;
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export function dailyRooms() {
  const key = Deno.env.get("DAILY_API_KEY");
  const origin = Deno.env.get("DAILY_ROOM_ORIGIN")?.replace(/\/$/, "");
  if (!key || !origin || !/^https:\/\/[a-z0-9-]+\.daily\.co$/.test(origin)) {
    throw new Error("Video service is not configured");
  }

  const request = (path: string, method = "GET", body?: unknown) => fetch(
    `https://api.daily.co/v1/${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    },
  );

  const roomPath = (name: string) => {
    if (!/^docnow-[a-f0-9]{32}$/.test(name)) throw new Error("Invalid room binding");
    return `rooms/${name}`;
  };

  const lookup = async (binding: StoredRoom) => {
    const response = await request(roomPath(binding.name));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Could not verify the video room");
    const data = await response.json();
    if (
      data.name !== binding.name || typeof data.id !== "string" || !data.id ||
      (binding.provider_id !== null && data.id !== binding.provider_id) ||
      data.url !== `${origin}/${binding.name}` || data.privacy !== "private" ||
      !Number.isInteger(data.config?.exp)
    ) throw new Error("Video room identity could not be verified");
    return { id: data.id as string, url: data.url as string, exp: data.config.exp as number };
  };

  return {
    lookup,
    async provision(binding: StoredRoom, expiresAt: number) {
      const current = await lookup(binding);
      if (current) return current;
      const response = await request("rooms", "POST", {
        name: binding.name,
        privacy: "private",
        properties: {
          exp: expiresAt, eject_at_room_exp: true, enable_chat: true,
          enable_screenshare: true, start_video_off: false, start_audio_off: true, enable_knocking: false,
        },
      });
      if (!response.ok) throw new Error("Could not create the video room");
      const created = await lookup(binding);
      if (!created) throw new Error("Video room is not ready");
      return created;
    },
    async token(name: string, actor: string, doctor: boolean, exp: number) {
      roomPath(name);
      const response = await request("meeting-tokens", "POST", {
        properties: {
          room_name: name, user_id: actor, is_owner: doctor, exp, eject_at_token_exp: true,
          start_audio_off: true,
        },
      });
      if (!response.ok) throw new Error("Could not authorize the video call");
      const result = await response.json();
      if (typeof result.token !== "string" || !result.token) throw new Error("Invalid video credentials");
      return result.token as string;
    },
    async close(binding: CleanupTarget) {
      if (binding.lease_active) return false;
      if (!await lookup(binding)) return true;
      const path = roomPath(binding.name);
      // Attempt deletion even if the provider rejects changing the TTL.
      await request(path, "POST", {
        properties: { exp: Math.floor(Date.now() / 1000), eject_at_room_exp: true },
      }).catch(() => null);
      const deleted = await request(path, "DELETE");
      if (!deleted.ok && deleted.status !== 404) return false;
      return (await lookup(binding)) === null;
    },
  };
}

export const callCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const callJson = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { ...callCors, "Cache-Control": "no-store" },
});
