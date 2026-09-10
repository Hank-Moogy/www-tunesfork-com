import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    const { sessionId } = await req.json();
    if (typeof sessionId !== "string" || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
      return json({ error: "Invalid session" }, 400);
    }
    const configuredEnvironment = Deno.env.get("STRIPE_ENVIRONMENT") || "sandbox";
    if (configuredEnvironment !== "sandbox" && configuredEnvironment !== "live") throw new Error("Invalid Stripe environment");
    const stripe = createStripeClient(configuredEnvironment as StripeEnv);
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (session.client_reference_id !== user.id || session.metadata?.userId !== user.id) {
      return json({ error: "Session does not belong to this account" }, 403);
    }
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    const subscription = typeof session.subscription === "object" ? session.subscription : null;
    const active = subscription ? ["active", "trialing", "past_due"].includes(subscription.status) : false;
    const plan = session.metadata?.plan;
    if (paid && active && ["producer", "founding_producer", "studio"].includes(plan || "")) {
      const { error: entitlementError } = await supabase.rpc("apply_account_plan", {
        _user_id: user.id, _plan: plan,
      });
      if (entitlementError) throw entitlementError;
    }
    return json({
      verified: paid && active,
      payment_status: session.payment_status,
      subscription_status: subscription?.status ?? null,
      plan: plan ?? null,
    });
  } catch (error) {
    console.error("[verify-checkout-session]", error);
    return json({ error: (error as Error).message }, 500);
  }
});
