// Browser (signed-in user) calls this to confirm a pair code. Issues a token and links it to the user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genToken() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const b64 = btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `tfsync_${b64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { code, device_name } = await req.json();
    if (typeof code !== "string" || code.length < 4) {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pair, error: pairErr } = await admin
      .from("device_pair_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (pairErr || !pair) {
      return new Response(JSON.stringify({ error: "Code not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pair.confirmed_at) {
      return new Response(JSON.stringify({ error: "Code already used" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(pair.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Code expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = genToken();
    const tokenHash = await sha256Hex(token);
    const tokenPrefix = token.slice(0, 14);

    const finalDeviceName = (device_name && String(device_name).slice(0, 80)) || pair.device_name || "Desktop";

    const { data: tokenRow, error: tokErr } = await admin
      .from("device_tokens")
      .insert({
        user_id: userId,
        name: finalDeviceName,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
      })
      .select()
      .single();
    if (tokErr) throw tokErr;

    await admin
      .from("device_pair_codes")
      .update({
        confirmed_at: new Date().toISOString(),
        user_id: userId,
        token_id: tokenRow.id,
      })
      .eq("id", pair.id);

    // Token is returned ONCE here (and via poll). Never stored in plain text.
    return new Response(
      JSON.stringify({ ok: true, device_name: finalDeviceName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pair-device-confirm]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
