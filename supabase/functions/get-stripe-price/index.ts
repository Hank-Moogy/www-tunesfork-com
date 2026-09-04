import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  createStripeClient,
  getConfiguredStripeEnvironment,
} from "../_shared/stripe.ts";
import {
  assertPriceMatchesContract,
  isSubscriptionLookupKey,
} from "../_shared/payment-contract.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const { priceId, environment } = await req.json();
    if (!isSubscriptionLookupKey(priceId)) {
      return new Response(JSON.stringify({ error: "Unknown subscription price" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const env = getConfiguredStripeEnvironment(environment);
    const stripe = createStripeClient(env);
    const prices = await stripe.prices.list({ active: true, lookup_keys: [priceId], limit: 2 });
    if (prices.data.length !== 1) {
      return new Response(JSON.stringify({ error: "Subscription price is unavailable" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    assertPriceMatchesContract(priceId, prices.data[0]);
    return new Response(JSON.stringify({ stripeId: prices.data[0].id }), {
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("get-stripe-price failed", error instanceof Error ? error.message : "unknown error");
    const stripeError = error as { type?: string; statusCode?: number };
    const message = error instanceof Error ? error.message : "";
    const diagnosticCode = message.includes("API_KEY is not configured")
      ? "stripe_configuration_missing"
      : message.toLowerCase().includes("api version")
      ? "stripe_api_version_rejected"
      : stripeError.type === "StripeAuthenticationError" || stripeError.statusCode === 401
      ? "stripe_authentication_failed"
      : stripeError.type === "StripePermissionError" || stripeError.statusCode === 403
      ? "stripe_permission_failed"
      : message.includes("does not match the TunesFork price contract")
      ? "price_contract_mismatch"
      : stripeError.type === "StripeInvalidRequestError"
      ? "stripe_request_rejected"
      : "stripe_unavailable";
    return new Response(JSON.stringify({
      error: "Unable to resolve subscription price",
      code: diagnosticCode,
    }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
