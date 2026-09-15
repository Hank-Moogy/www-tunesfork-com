import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Retained as a tombstone during rollout so stale clients fail closed instead
// of bypassing the Managed Payments price and subscription checks.
serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({
    error: "This checkout endpoint has been retired. Refresh TunesFork and try again.",
    code: "checkout_endpoint_retired",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
