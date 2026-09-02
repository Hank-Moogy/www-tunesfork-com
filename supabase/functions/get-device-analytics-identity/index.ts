import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing device token" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const tokenHash = await sha256Hex(token);
    const { data: tokenRow } = await admin.from("device_tokens")
      .select("id,user_id,name")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (!tokenRow) return json({ error: "Invalid or revoked token" }, 401);

    const [{ data: authUser }, { data: entitlement }, { data: storageUsage }] = await Promise.all([
      admin.auth.admin.getUserById(tokenRow.user_id),
      admin.from("account_entitlements")
        .select("plan")
        .eq("user_id", tokenRow.user_id)
        .maybeSingle(),
      admin.rpc("get_account_storage_usage", { _user_id: tokenRow.user_id }),
    ]);

    await admin.from("device_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    return json({
      user_id: tokenRow.user_id,
      email: authUser?.user?.email ?? null,
      plan: entitlement?.plan ?? "free",
      device_name: tokenRow.name,
      storage_used_bytes: storageUsage?.used_bytes ?? 0,
      storage_limit_bytes: storageUsage?.limit_bytes ?? null,
    });
  } catch (error) {
    console.error("[get-device-analytics-identity]", error);
    return json({ error: (error as Error).message }, 500);
  }
});
