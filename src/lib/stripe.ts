export type ClientStripeEnvironment = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function getStripeEnvironment(): ClientStripeEnvironment {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is missing or invalid");
}

export function isStripeSandbox(): boolean {
  try {
    return getStripeEnvironment() === "sandbox";
  } catch {
    return false;
  }
}

export function isTrustedStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

export function isTrustedStripeBillingPortalUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com";
  } catch {
    return false;
  }
}
