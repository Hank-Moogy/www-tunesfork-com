import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Retained as a tombstone during rollout. Checkout verification now uses the
// authenticated, environment-bound checkout-session-status endpoint.
serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({
    error: "This checkout verification endpoint has been retired.",
    code: "checkout_verification_endpoint_retired",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
