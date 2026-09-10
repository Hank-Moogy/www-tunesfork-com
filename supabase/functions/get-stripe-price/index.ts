import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getConfiguredStripeEnvironment,
  getConnectionApiKey,
} from "../_shared/stripe.ts";
import {
  assertPriceMatchesContract,
  isSubscriptionLookupKey,
  STRIPE_STABLE_API_VERSION,
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

  let diagnosticStage = "request";
  try {
    const { priceId, environment } = await req.json();
    if (!isSubscriptionLookupKey(priceId)) {
      return new Response(JSON.stringify({ error: "Unknown subscription price" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    diagnosticStage = "environment";
    const env = getConfiguredStripeEnvironment(environment);
    const query = new URLSearchParams({ active: "true", limit: "2" });
    query.append("lookup_keys[]", priceId);
    diagnosticStage = "stripe_request";
    const stripeResponse = await fetch(`https://api.stripe.com/v1/prices?${query}`, {
      headers: {
        Authorization: `Bearer ${getConnectionApiKey(env)}`,
        "Stripe-Version": STRIPE_STABLE_API_VERSION,
      },
    });
    if (!stripeResponse.ok) {
      diagnosticStage = "stripe_response";
      const requestError = new Error("Stripe API request failed") as Error & {
        statusCode?: number;
        type?: string;
      };
      requestError.statusCode = stripeResponse.status;
      requestError.type = stripeResponse.status === 401
        ? "StripeAuthenticationError"
        : stripeResponse.status === 403
        ? "StripePermissionError"
        : "StripeInvalidRequestError";
      throw requestError;
    }
    diagnosticStage = "response_parse";
    const prices = await stripeResponse.json() as { data?: Array<Parameters<typeof assertPriceMatchesContract>[1] & { id: string }> };
    if (prices.data?.length !== 1) {
      return new Response(JSON.stringify({ error: "Subscription price is unavailable" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    diagnosticStage = "price_contract";
    assertPriceMatchesContract(priceId, prices.data[0]);
    return new Response(JSON.stringify({ stripeId: prices.data[0].id }), {
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("get-stripe-price failed", error instanceof Error ? error.message : "unknown error");
    const stripeError = error as { type?: string; statusCode?: number };
    const message = error instanceof Error ? error.message : "";
    const diagnosticCode = message.includes("invalid characters")
      ? "stripe_key_has_invalid_characters"
      : message.includes("contains whitespace")
      ? "stripe_key_has_whitespace"
      : message.includes("does not match the sandbox environment")
      ? "stripe_key_is_not_sandbox_secret"
      : message.includes("API_KEY is not configured")
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
      stage: diagnosticStage,
    }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
