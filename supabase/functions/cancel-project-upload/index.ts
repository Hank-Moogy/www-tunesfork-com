// Desktop app calls this when an incremental upload run dies part-way through, so the
// reservation it holds is released instead of blocking every retry with UPLOAD_CONFLICT
// until its 24h expiry.
// Body: { reservation_id: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { z } from "https://esm.sh/zod@3.25.76";

const BodySchema = z.object({ reservation_id: z.string().uuid() });

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing device token" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ code: "RESERVATION_INVALID", error: "A reservation id is required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const tokenHash = await sha256Hex(token);
    const { data: tokenRow } = await admin.from("device_tokens")
      .select("id,user_id").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
    if (!tokenRow) return json({ error: "Invalid or revoked token" }, 401);

    // Scoped to the calling device's uploader id, and a no-op once the reservation is
    // already cancelled, expired or finalized.
    const { error } = await admin.rpc("cancel_upload_reservation", {
      _reservation_id: parsed.data.reservation_id,
      _uploader_id: tokenRow.user_id,
    });
    if (error) throw error;

    return json({ released: true });
  } catch (error) {
    console.error("[cancel-project-upload]", error);
    return json({ code: "RESERVATION_CANCEL_FAILED", error: (error as Error).message }, 500);
  }
});
