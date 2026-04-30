import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { z } from "https://esm.sh/zod@3.25.76";

const BodySchema = z.object({
  content_type: z.string().max(120).optional().default("application/zip"),
});

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing device token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = auth.slice(7).trim();
    const tokenHash = await sha256Hex(token);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenRow } = await admin
      .from("device_tokens")
      .select("id,user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "Invalid or revoked token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const objectPath = `${tokenRow.user_id}/${Date.now()}-${crypto.randomUUID()}.zip`;
    const { data, error } = await admin.storage
      .from("project-zips")
      .createSignedUploadUrl(objectPath, { upsert: false });

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "Could not create signed upload URL");
    }

    await admin.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

    return new Response(JSON.stringify({ objectPath, signedUrl: data.signedUrl, contentType: parsed.data.content_type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[mint-storage-upload-url]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
