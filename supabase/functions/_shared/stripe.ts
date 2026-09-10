import Stripe from "https://esm.sh/stripe@22.4.0";
import {
  MANAGED_PAYMENTS_PREVIEW_VERSION_FALLBACK,
  resolveStripeEnvironment,
  STRIPE_STABLE_API_VERSION,
  type StripeEnv,
} from "./payment-contract.ts";

export type { StripeEnv } from "./payment-contract.ts";

export function getConfiguredStripeEnvironment(requested?: unknown): StripeEnv {
  return resolveStripeEnvironment(Deno.env.get("STRIPE_ENVIRONMENT"), requested);
}

export function getConnectionApiKey(env: StripeEnv): string {
  const key = env === "sandbox"
    ? Deno.env.get("STRIPE_SANDBOX_API_KEY")
    : Deno.env.get("STRIPE_LIVE_API_KEY");
  if (!key) throw new Error(`STRIPE_${env.toUpperCase()}_API_KEY is not configured`);
  if (key !== key.trim() || /\s/.test(key)) {
    throw new Error("Stripe API key contains whitespace");
  }
  const expectedPrefix = env === "sandbox" ? "sk_test_" : "sk_live_";
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`Stripe API key does not match the ${env} environment`);
  }
  if (!/^[A-Za-z0-9_]+$/.test(key)) {
    throw new Error("Stripe API key contains invalid characters");
  }
  return key;
}

export function getPublicSiteUrl(): string {
  const configured = Deno.env.get("PUBLIC_SITE_URL");
  if (!configured) throw new Error("PUBLIC_SITE_URL is not configured");

  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("PUBLIC_SITE_URL must use HTTPS");
  }
  return url.origin;
}

export function createStripeClient(
  env: StripeEnv,
  apiVersion = STRIPE_STABLE_API_VERSION,
): Stripe {
  const apiKey = getConnectionApiKey(env);
  return new Stripe(apiKey, {
    apiVersion: apiVersion as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function createManagedPaymentsStripeClient(env: StripeEnv): Stripe {
  const previewVersion = Deno.env.get("STRIPE_MANAGED_PAYMENTS_API_VERSION") ||
    MANAGED_PAYMENTS_PREVIEW_VERSION_FALLBACK;
  if (!/^\d{4}-\d{2}-\d{2}\.preview$/.test(previewVersion)) {
    throw new Error("STRIPE_MANAGED_PAYMENTS_API_VERSION must be a Stripe preview version");
  }
  return createStripeClient(env, previewVersion);
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyWebhook(req: Request, env: StripeEnv): Promise<Stripe.Event> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret = env === "sandbox"
    ? Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : Deno.env.get("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!secret) throw new Error("Webhook secret environment variable is not configured");
  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }

  if (!timestamp || v1Signatures.length === 0) throw new Error("Invalid signature format");

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) throw new Error("Invalid webhook timestamp");
  const age = Math.abs(Date.now() / 1000 - timestampNumber);
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const payload = new TextEncoder().encode(`${timestamp}.${body}`);
  const valid = await Promise.all(v1Signatures.map(async (candidate) => {
    const decoded = decodeHex(candidate);
    return decoded ? crypto.subtle.verify("HMAC", key, decoded, payload) : false;
  }));
  if (!valid.some(Boolean)) throw new Error("Invalid webhook signature");

  const event = JSON.parse(body) as Stripe.Event;
  if (!event.id || !event.type || !event.data?.object) throw new Error("Invalid webhook event");
  return event;
}
