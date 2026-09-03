/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  type StripeEnv,
  createStripeClient,
  getConfiguredStripeEnvironment,
  verifyWebhook,
} from "../_shared/stripe.ts";
import { isSubscriptionLookupKey } from "../_shared/payment-contract.ts";
import { invoiceSubscriptionId } from "../_shared/stripe-events.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const planFromLookupKey = (lookupKey?: string | null) => {
  if (lookupKey?.startsWith("founding_producer_")) return "founding_producer";
  if (lookupKey?.startsWith("studio_")) return "studio";
  if (lookupKey?.startsWith("producer_")) return "producer";
  return null;
};

async function sendAmplitudeEvent(
  name: string,
  userId: string,
  email: string | null,
  properties: Record<string, unknown>,
  insertId: string,
) {
  const apiKey = Deno.env.get("AMPLITUDE_API_KEY");
  if (!apiKey) return;
  const endpoint = Deno.env.get("AMPLITUDE_SERVER_ZONE") === "EU"
    ? "https://api.eu.amplitude.com/2/httpapi"
    : "https://api2.amplitude.com/2/httpapi";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      events: [{
        event_type: name,
        user_id: userId,
        insert_id: insertId,
        time: Date.now(),
        event_properties: { ...properties, app_surface: "server" },
        user_properties: email ? { email, email_domain: email.split("@")[1] ?? "" } : {},
      }],
    }),
  });
  if (!response.ok) console.error("Amplitude ingestion failed", response.status, await response.text());
}

async function userEmail(userId: string) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data.user?.email?.toLowerCase() ?? null;
}

async function applyPlan(userId: string, plan: string) {
  const { error } = await supabase.rpc("apply_account_plan", { _user_id: userId, _plan: plan });
  if (error) throw error;
}

async function ensureFoundingPriceTransition(session: any, env: StripeEnv) {
  const lookupKey = session.metadata?.lookupKey as string | undefined;
  if (!lookupKey?.startsWith("founding_producer_") || !session.subscription) return;
  const stripe = createStripeClient(env);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);
  const foundingItem = subscription.items?.data?.[0];
  if (!foundingItem?.price?.id) throw new Error("Founding subscription has no price");
  const yearly = lookupKey.endsWith("yearly");
  const standardLookupKey = yearly ? "producer_yearly" : "producer_monthly";
  const standardPrices = await stripe.prices.list({ lookup_keys: [standardLookupKey], active: true, limit: 1 });
  if (!standardPrices.data[0]) throw new Error(`Missing Stripe price ${standardLookupKey}`);

  const schedule: any = subscription.schedule
    ? await stripe.subscriptionSchedules.retrieve(
        typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule.id,
      )
    : await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
  const phaseStart = schedule.current_phase?.start_date || subscription.current_period_start;
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        start_date: phaseStart,
        items: [{ price: foundingItem.price.id, quantity: foundingItem.quantity || 1 }],
        iterations: yearly ? 1 : 12,
        metadata: { plan: "founding_producer", year: "one" },
      },
      {
        items: [{ price: standardPrices.data[0].id, quantity: foundingItem.quantity || 1 }],
        metadata: { plan: "producer", transition: "founding_year_complete" },
      },
    ],
  } as any);
}

async function upsertSubscription(subscription: any, env: StripeEnv) {
  let userId = subscription.metadata?.userId as string | undefined;
  if (!userId) {
    const { data: existing } = await supabase.from("subscriptions")
      .select("user_id").eq("stripe_subscription_id", subscription.id)
      .eq("environment", env).maybeSingle();
    userId = existing?.user_id;
  }
  if (!userId) throw new Error(`No userId for subscription ${subscription.id}`);

  const item = subscription.items?.data?.[0];
  const lookupKey = item?.price?.lookup_key || subscription.metadata?.lookupKey || item?.price?.id;
  const plan = planFromLookupKey(lookupKey) || subscription.metadata?.plan || "producer";
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const { error } = await supabase.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer,
    product_id: item?.price?.product || "unknown",
    price_id: lookupKey,
    status: subscription.status,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    environment: env,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
  if (error) throw error;
  if (plan === "founding_producer") {
    await supabase.from("founding_checkout_reservations").delete()
      .eq("user_id", userId).eq("environment", env);
  }
  if (["active", "trialing", "past_due"].includes(subscription.status)) await applyPlan(userId, plan);
  return { userId, plan, lookupKey };
}

async function processEvent(event: any, env: StripeEnv) {
  const object = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const userId = object.metadata?.userId || object.client_reference_id;
      const lookupKey = object.metadata?.lookupKey;
      if (object.mode !== "subscription" || !isSubscriptionLookupKey(lookupKey)) {
        throw new Error(`Checkout ${object.id} has no trusted subscription price`);
      }
      const plan = planFromLookupKey(lookupKey);
      if (!userId || !plan) throw new Error(`Checkout ${object.id} has no trusted plan identity`);
      if (object.payment_status !== "paid" && object.payment_status !== "no_payment_required") {
        throw new Error(`Checkout ${object.id} is not paid`);
      }
      await ensureFoundingPriceTransition(object, env);
      await applyPlan(userId, plan);
      await sendAmplitudeEvent("Checkout Completed", userId, await userEmail(userId), {
        plan, amount_total: object.amount_total, currency: object.currency,
      }, `${event.id}:checkout`);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const result = await upsertSubscription(object, env);
      if (["active", "trialing"].includes(object.status)) {
        await sendAmplitudeEvent("Subscription Activated", result.userId, await userEmail(result.userId), {
          plan: result.plan, lookup_key: result.lookupKey, status: object.status,
          cancel_at_period_end: object.cancel_at_period_end || false,
        }, `${event.id}:subscription`);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const { data: existing } = await supabase.from("subscriptions")
        .select("user_id").eq("stripe_subscription_id", object.id)
        .eq("environment", env).maybeSingle();
      if (!existing?.user_id) throw new Error(`Subscription ${object.id} was not registered`);
      const { error } = await supabase.from("subscriptions").update({
        status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString(),
      }).eq("stripe_subscription_id", object.id).eq("environment", env);
      if (error) throw error;
      await applyPlan(existing.user_id, "free");
      await sendAmplitudeEvent("Subscription Cancelled", existing.user_id, await userEmail(existing.user_id), {
        stripe_subscription_id: object.id,
      }, `${event.id}:cancelled`);
      break;
    }
    case "invoice.payment_failed": {
      const subscriptionId = invoiceSubscriptionId(object);
      if (!subscriptionId) throw new Error(`Invoice ${object.id} is not linked to a subscription`);
      const { data: existing } = await supabase.from("subscriptions")
        .select("user_id").eq("stripe_subscription_id", subscriptionId)
        .eq("environment", env).maybeSingle();
      if (existing?.user_id) {
        await sendAmplitudeEvent("Payment Failed", existing.user_id, await userEmail(existing.user_id), {
          stripe_subscription_id: subscriptionId, invoice_id: object.id,
          attempt_count: object.attempt_count,
        }, `${event.id}:failed`);
      }
      break;
    }
    default:
      console.log("Unhandled Stripe event", event.type);
  }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let event: any;

  try {
    const env = getConfiguredStripeEnvironment(new URL(req.url).searchParams.get("env"));
    event = await verifyWebhook(req, env);
    const { error: insertError } = await supabase.from("stripe_webhook_events").insert({
      event_id: event.id, environment: env, event_type: event.type,
    });
    if (insertError?.code === "23505") {
      const { data: prior } = await supabase.from("stripe_webhook_events")
        .select("status,attempts").eq("event_id", event.id).single();
      if (prior?.status === "processed") {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      await supabase.from("stripe_webhook_events").update({
        status: "processing", attempts: (prior?.attempts || 1) + 1, last_error: null,
      }).eq("event_id", event.id);
    } else if (insertError) throw insertError;

    await processEvent(event, env);
    await supabase.from("stripe_webhook_events").update({
      status: "processed", processed_at: new Date().toISOString(), last_error: null,
    }).eq("event_id", event.id);
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error", error);
    if (event?.id) {
      await supabase.from("stripe_webhook_events").update({
        status: "failed", last_error: String((error as Error).message).slice(0, 1000),
      }).eq("event_id", event.id);
    }
    return new Response("Webhook error", { status: 400 });
  }
});
