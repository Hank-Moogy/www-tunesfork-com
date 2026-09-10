import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  createStripeClient,
  getConfiguredStripeEnvironment,
} from "../_shared/stripe.ts";
import { isSubscriptionLookupKey } from "../_shared/payment-contract.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const sessionIdPattern = /^cs_(?:test|live)_[A-Za-z0-9]+$/;

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return respond({ error: "Unauthorized" }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return respond({ error: "Unauthorized" }, 401);

    const { sessionId, environment } = await req.json();
    if (typeof sessionId !== "string" || !sessionIdPattern.test(sessionId)) {
      return respond({ error: "Invalid Checkout Session" }, 400);
    }

    const env = getConfiguredStripeEnvironment(environment);
    const stripe = createStripeClient(env);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const belongsToUser = session.client_reference_id === user.id &&
      session.metadata?.userId === user.id;
    const correctEnvironment = session.livemode === (env === "live") &&
      session.metadata?.environment === env;
    if (!belongsToUser || !correctEnvironment) {
      return respond({ error: "Checkout Session not found" }, 404);
    }

    const subscription = typeof session.subscription === "object"
      ? session.subscription
      : null;
    const subscriptionStatus = subscription && "status" in subscription
      ? subscription.status
      : null;
    const lookupKey = isSubscriptionLookupKey(session.metadata?.lookupKey)
      ? session.metadata.lookupKey
      : null;
    const complete = session.status === "complete";
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    const ready = complete && paid &&
      (subscriptionStatus === "active" || subscriptionStatus === "trialing");

    return respond({
      status: session.status,
      paymentStatus: session.payment_status,
      subscriptionStatus,
      lookupKey,
      ready,
    });
  } catch (error) {
    console.error("checkout-session-status failed", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "Unable to verify Checkout Session" }, 500);
  }
});
