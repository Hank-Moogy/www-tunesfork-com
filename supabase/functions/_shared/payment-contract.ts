export type StripeEnv = "sandbox" | "live";

export const STRIPE_STABLE_API_VERSION = "2026-02-25.clover";
export const MANAGED_PAYMENTS_PREVIEW_VERSION_FALLBACK = "2026-03-04.preview";

export const SUBSCRIPTION_PRICE_CONTRACT = {
  producer_monthly: { amount: 799, currency: "eur", interval: "month" },
  producer_yearly: { amount: 7900, currency: "eur", interval: "year" },
  founding_producer_monthly: { amount: 499, currency: "eur", interval: "month" },
  founding_producer_yearly: { amount: 4900, currency: "eur", interval: "year" },
  studio_monthly: { amount: 2900, currency: "eur", interval: "month" },
  studio_yearly: { amount: 29000, currency: "eur", interval: "year" },
} as const;

export type SubscriptionLookupKey = keyof typeof SUBSCRIPTION_PRICE_CONTRACT;

export function isSubscriptionLookupKey(value: unknown): value is SubscriptionLookupKey {
  return typeof value === "string" && value in SUBSCRIPTION_PRICE_CONTRACT;
}

export function resolveStripeEnvironment(
  configured: unknown,
  requested?: unknown,
): StripeEnv {
  if (configured !== "sandbox" && configured !== "live") {
    throw new Error("STRIPE_ENVIRONMENT must be configured as sandbox or live");
  }

  if (requested !== undefined && requested !== null && requested !== configured) {
    throw new Error("Requested payment environment does not match the server environment");
  }

  return configured;
}

export function assertPriceMatchesContract(
  lookupKey: SubscriptionLookupKey,
  price: {
    active?: boolean;
    currency?: string;
    type?: string;
    unit_amount?: number | null;
    recurring?: { interval?: string; interval_count?: number } | null;
  },
): void {
  const expected = SUBSCRIPTION_PRICE_CONTRACT[lookupKey];
  const matches = price.active !== false &&
    price.type === "recurring" &&
    price.currency === expected.currency &&
    price.unit_amount === expected.amount &&
    price.recurring?.interval === expected.interval &&
    (price.recurring?.interval_count ?? 1) === 1;

  if (!matches) {
    throw new Error(`Stripe price ${lookupKey} does not match the TunesFork price contract`);
  }
}
