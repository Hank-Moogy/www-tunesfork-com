import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// Compatibility tombstone for older desktop builds. Full-project ZIP uploads
// bypass incremental storage accounting, so this endpoint must never mint
// another upload URL. Current builds negotiate owner-scoped manifest blobs.
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return new Response(JSON.stringify({
    code: "LEGACY_ZIP_UPLOAD_DISABLED",
    error: "Full-project ZIP uploads are disabled. Update Tunesfork Sync to continue.",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
