import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { priceId } = await req.json();
    const allowedPrices = new Set([
      "producer_monthly", "producer_yearly",
      "founding_producer_monthly", "founding_producer_yearly",
      "studio_monthly", "studio_yearly",
    ]);
    if (typeof priceId !== "string" || !allowedPrices.has(priceId)) {
      return new Response(JSON.stringify({ error: "Invalid priceId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const configuredEnvironment = Deno.env.get("STRIPE_ENVIRONMENT") || "sandbox";
    if (configuredEnvironment !== "sandbox" && configuredEnvironment !== "live") {
      throw new Error("STRIPE_ENVIRONMENT must be sandbox or live");
    }
    const env = configuredEnvironment as StripeEnv;
    const stripe = createStripeClient(env);

    if (priceId.startsWith("founding_producer_")) {
      const { data: reserved, error: reserveError } = await supabase.rpc("reserve_founding_producer_slot", {
        _user_id: user.id,
        _environment: env,
        _interval: priceId.endsWith("yearly") ? "year" : "month",
      });
      if (reserveError || !reserved) {
        return new Response(JSON.stringify({ error: "Launch offer sold out" }), {
          status: 410,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Resolve human-readable price ID to Stripe price ID
    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) {
      return new Response(JSON.stringify({ error: "Price not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripePrice = prices.data[0];
    if (stripePrice.type !== "recurring") throw new Error("Configured price is not recurring");

    const requestOrigin = req.headers.get("origin") || "";
    const fallbackAllowed = /^https:\/\/(www\.)?tunesfork\.com$/i.test(requestOrigin)
      || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || (fallbackAllowed ? requestOrigin : "")).replace(/\/$/, "");
    if (!siteUrl) throw new Error("PUBLIC_SITE_URL is not configured");
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "subscription",
      ui_mode: "embedded",
      return_url: `${siteUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id, lookupKey: priceId, plan: priceId.replace(/_(monthly|yearly)$/, "") },
      subscription_data: {
        metadata: { userId: user.id, lookupKey: priceId, plan: priceId.replace(/_(monthly|yearly)$/, "") },
      },
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
