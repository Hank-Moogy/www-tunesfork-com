// Desktop app calls this to start pairing. Returns a 6-char code + a URL the user opens in their browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "https://tunesfork.com";

function genCode() {
  // 6-char code, uppercase letters + digits, no ambiguous chars
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) s += alphabet[buf[i] % alphabet.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const deviceName = String(body.device_name ?? "Desktop").slice(0, 80);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = genCode();
      const { error } = await supa
        .from("device_pair_codes")
        .insert({ code, device_name: deviceName });
      if (!error) break;
      if (attempt === 4) throw error;
    }

    return new Response(
      JSON.stringify({
        code,
        pair_url: `${PUBLIC_BASE_URL}/desktop-pair?code=${code}`,
        expires_in_seconds: 15 * 60,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pair-device-init]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
