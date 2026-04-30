// Desktop app polls this with the code. Once confirmed, returns the token (one-time).
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
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pair } = await admin
      .from("device_pair_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!pair) {
      return new Response(JSON.stringify({ status: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(pair.expires_at) < new Date()) {
      return new Response(JSON.stringify({ status: "expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!pair.confirmed_at || !pair.token_id) {
      return new Response(JSON.stringify({ status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokenRow } = await admin
      .from("device_tokens")
      .select("*")
      .eq("id", pair.token_id)
      .maybeSingle();
    if (!tokenRow) {
      return new Response(JSON.stringify({ status: "expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenRow.last_used_at) {
      return new Response(JSON.stringify({ status: "already_delivered" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = genToken();
    const tokenHash = await sha256Hex(token);
    const tokenPrefix = token.slice(0, 14);

    await admin
      .from("device_tokens")
      .update({
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", tokenRow.id);

    return new Response(
      JSON.stringify({
        status: "confirmed",
        token,
        device_name: tokenRow.name,
        user_id: tokenRow.user_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pair-device-poll]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
