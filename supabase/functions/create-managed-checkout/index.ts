import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  createManagedPaymentsStripeClient,
  getConfiguredStripeEnvironment,
  getPublicSiteUrl,
} from "../_shared/stripe.ts";
import { assertPriceMatchesContract, isSubscriptionLookupKey } from "../_shared/payment-contract.ts";

// Separate endpoint keeps the current embedded sandbox checkout working during rollout.

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const blockingSubscriptionStatuses = ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"];

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  let diagnosticStage = "request";
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return respond({ error: "Unauthorized" }, 401);

    diagnosticStage = "authentication";
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.email) return respond({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { priceId, checkoutRequestId, environment } = body;
    if (!isSubscriptionLookupKey(priceId)) return respond({ error: "Unknown subscription price" }, 400);
    if (typeof checkoutRequestId !== "string" || !requestIdPattern.test(checkoutRequestId)) {
      return respond({ error: "Invalid checkout request" }, 400);
    }

    diagnosticStage = "environment";
    const env = getConfiguredStripeEnvironment(environment);
    const stripe = createManagedPaymentsStripeClient(env);
    const siteUrl = getPublicSiteUrl();
    const plan = priceId.replace(/_(monthly|yearly)$/, "");

    const { data: existingSubscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id,status")
      .eq("user_id", user.id)
      .eq("environment", env)
      .in("status", blockingSubscriptionStatuses)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (existingSubscription) {
      return respond({
        error: "An existing subscription must be managed through the billing portal",
        code: "subscription_exists",
      }, 409);
    }

    const { data: previousSubscription, error: previousSubscriptionError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousSubscriptionError) throw previousSubscriptionError;

    if (priceId.startsWith("founding_producer_")) {
      const { data: reserved, error: reserveError } = await supabase.rpc("reserve_founding_producer_slot", {
        _user_id: user.id,
        _environment: env,
        _interval: priceId.endsWith("yearly") ? "year" : "month",
      });
      if (reserveError || !reserved) return respond({ error: "Launch offer sold out" }, 410);
    }

    diagnosticStage = "price_lookup";
    const prices = await stripe.prices.list({
      active: true,
      lookup_keys: [priceId],
      limit: 2,
      expand: ["data.product"],
    });
    if (prices.data.length !== 1) return respond({ error: "Subscription price is unavailable" }, 503);
    const stripePrice = prices.data[0];
    assertPriceMatchesContract(priceId, stripePrice);

    diagnosticStage = "checkout_session";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      success_url: `${siteUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pricing?checkout=canceled`,
      client_reference_id: user.id,
      ...(previousSubscription?.stripe_customer_id
        ? { customer: previousSubscription.stripe_customer_id }
        : { customer_email: user.email }),
      metadata: { userId: user.id, lookupKey: priceId, plan, environment: env },
      subscription_data: { metadata: { userId: user.id, lookupKey: priceId, plan, environment: env } },
      managed_payments: { enabled: true },
    } as Parameters<typeof stripe.checkout.sessions.create>[0], {
      idempotencyKey: `tf_checkout_${env}_${user.id}_${checkoutRequestId}`,
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return respond({ url: session.url });
  } catch (error) {
    const stripeError = error as { code?: string; param?: string; statusCode?: number; type?: string };
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    console.error("create-managed-checkout failed", error instanceof Error ? error.message : "unknown error");
    const code = message.includes("tax code") || message.includes("tax_code")
      ? "managed_payments_tax_code_required"
      : message.includes("terms") && message.includes("managed")
      ? "managed_payments_terms_required"
      : message.includes("managed_payments") && message.includes("unknown parameter")
      ? "managed_payments_api_version_mismatch"
      : message.includes("managed payments") && (message.includes("enable") || message.includes("activate"))
      ? "managed_payments_not_enabled"
      : message.includes("managed payments") && message.includes("eligible")
      ? "managed_payments_product_ineligible"
      : stripeError.type === "StripeAuthenticationError" || stripeError.statusCode === 401
      ? "stripe_authentication_failed"
      : stripeError.type === "StripePermissionError" || stripeError.statusCode === 403
      ? "stripe_permission_failed"
      : diagnosticStage === "checkout_session"
      ? "stripe_checkout_rejected"
      : "checkout_unavailable";
    return respond({ error: "Unable to start checkout", code, stage: diagnosticStage }, 500);
  }
});
