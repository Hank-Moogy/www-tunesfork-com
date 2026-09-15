import { describe, expect, it } from "vitest";
import {
  assertPriceMatchesContract,
  isSubscriptionLookupKey,
  normalizePublicSiteUrl,
  resolveStripeEnvironment,
  STRIPE_STABLE_API_VERSION,
  SUBSCRIPTION_PRICE_CONTRACT,
  TUNESFORK_PRODUCT_TAX_CODE,
} from "../../supabase/functions/_shared/payment-contract";
import {
  isTrustedStripeBillingPortalUrl,
  isTrustedStripeCheckoutUrl,
} from "@/lib/stripe";
import {
  invoiceSubscriptionId,
  stripeObjectId,
  subscriptionCancelsAtPeriodEnd,
  subscriptionGrantsPaidAccess,
  subscriptionPeriod,
} from "../../supabase/functions/_shared/stripe-events";

describe("TunesFork Stripe price contract", () => {
  it("keeps the six exact lookup keys and EUR amounts", () => {
    expect(STRIPE_STABLE_API_VERSION).toBe("2026-02-25.clover");
    expect(SUBSCRIPTION_PRICE_CONTRACT).toEqual({
      producer_monthly: { amount: 799, currency: "eur", interval: "month" },
      producer_yearly: { amount: 7900, currency: "eur", interval: "year" },
      founding_producer_monthly: { amount: 499, currency: "eur", interval: "month" },
      founding_producer_yearly: { amount: 4900, currency: "eur", interval: "year" },
      studio_monthly: { amount: 2900, currency: "eur", interval: "month" },
      studio_yearly: { amount: 29000, currency: "eur", interval: "year" },
    });
  });

  it("rejects unknown lookup keys", () => {
    expect(isSubscriptionLookupKey("producer_monthly")).toBe(true);
    expect(isSubscriptionLookupKey("launch_offer_once")).toBe(false);
    expect(isSubscriptionLookupKey("price_123")).toBe(false);
  });

  it("rejects a Stripe price that drifts from the contract", () => {
    expect(() => assertPriceMatchesContract("producer_monthly", {
      active: true,
      currency: "eur",
      type: "recurring",
      unit_amount: 799,
      recurring: { interval: "month", interval_count: 1 },
      product: { tax_code: TUNESFORK_PRODUCT_TAX_CODE },
    })).not.toThrow();

    expect(() => assertPriceMatchesContract("producer_monthly", {
      active: true,
      currency: "eur",
      type: "recurring",
      unit_amount: 999,
      recurring: { interval: "month", interval_count: 1 },
      product: { tax_code: TUNESFORK_PRODUCT_TAX_CODE },
    })).toThrow(/does not match/);
  });

  it("rejects products without TunesFork's eligible downloadable-SaaS tax code", () => {
    expect(() => assertPriceMatchesContract("producer_monthly", {
      active: true,
      currency: "eur",
      type: "recurring",
      unit_amount: 799,
      recurring: { interval: "month", interval_count: 1 },
      product: { tax_code: null },
    })).toThrow(/does not match/);
  });
});

describe("Stripe environment isolation", () => {
  it("requires an explicit server environment", () => {
    expect(resolveStripeEnvironment("sandbox", "sandbox")).toBe("sandbox");
    expect(() => resolveStripeEnvironment(undefined)).toThrow(/STRIPE_ENVIRONMENT/);
  });

  it("rejects a client environment mismatch", () => {
    expect(() => resolveStripeEnvironment("sandbox", "live")).toThrow(/does not match/);
  });
});

describe("Stripe return URL configuration", () => {
  it("allows production HTTPS and explicit local HTTP origins", () => {
    expect(normalizePublicSiteUrl("https://tunesfork.com/checkout")).toBe("https://tunesfork.com");
    expect(normalizePublicSiteUrl("http://localhost:8080/path")).toBe("http://localhost:8080");
    expect(normalizePublicSiteUrl("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
  });

  it("rejects insecure public origins and non-HTTP localhost schemes", () => {
    expect(() => normalizePublicSiteUrl("http://tunesfork.com")).toThrow(/HTTPS or local HTTP/);
    expect(() => normalizePublicSiteUrl("ftp://localhost/files")).toThrow(/HTTPS or local HTTP/);
    expect(() => normalizePublicSiteUrl(undefined)).toThrow(/not configured/);
  });
});

describe("Stripe redirect allowlists", () => {
  it("accepts only Stripe's hosted Checkout origin", () => {
    expect(isTrustedStripeCheckoutUrl("https://checkout.stripe.com/c/pay/test")).toBe(true);
    expect(isTrustedStripeCheckoutUrl("https://checkout.stripe.com.evil.test/pay")).toBe(false);
    expect(isTrustedStripeCheckoutUrl("javascript:alert(1)")).toBe(false);
  });

  it("accepts only Stripe's billing portal origin", () => {
    expect(isTrustedStripeBillingPortalUrl("https://billing.stripe.com/p/session/test")).toBe(true);
    expect(isTrustedStripeBillingPortalUrl("https://checkout.stripe.com/c/pay/test")).toBe(false);
  });
});

describe("Stripe webhook payload compatibility", () => {
  it("grants paid entitlements only for active, trialing, or recoverable past-due subscriptions", () => {
    expect(subscriptionGrantsPaidAccess("active")).toBe(true);
    expect(subscriptionGrantsPaidAccess("trialing")).toBe(true);
    expect(subscriptionGrantsPaidAccess("past_due")).toBe(true);
    expect(subscriptionGrantsPaidAccess("unpaid")).toBe(false);
    expect(subscriptionGrantsPaidAccess("paused")).toBe(false);
    expect(subscriptionGrantsPaidAccess("canceled")).toBe(false);
    expect(subscriptionGrantsPaidAccess("incomplete_expired")).toBe(false);
    expect(subscriptionGrantsPaidAccess(undefined)).toBe(false);
  });

  it("extracts object IDs without trusting arbitrary shapes", () => {
    expect(stripeObjectId("sub_123")).toBe("sub_123");
    expect(stripeObjectId({ id: "sub_456" })).toBe("sub_456");
    expect(stripeObjectId({ id: 123 })).toBeNull();
  });

  it("supports legacy and current invoice subscription locations", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_legacy" })).toBe("sub_legacy");
    expect(invoiceSubscriptionId({
      parent: { subscription_details: { subscription: { id: "sub_current" } } },
    })).toBe("sub_current");
  });

  it("uses item-level billing periods used by current Stripe payloads", () => {
    expect(subscriptionPeriod({ id: "sub_123" }, {
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_592_000,
    })).toEqual({
      start: "2023-11-14T22:13:20.000Z",
      end: "2023-12-14T22:13:20.000Z",
    });
  });

  it("recognizes both Stripe representations of a period-end cancellation", () => {
    expect(subscriptionCancelsAtPeriodEnd({
      id: "sub_boolean",
      cancel_at_period_end: true,
    })).toBe(true);
    expect(subscriptionCancelsAtPeriodEnd({
      id: "sub_portal",
      cancel_at: 1_702_592_000,
    }, {
      current_period_end: 1_702_592_000,
    })).toBe(true);
    expect(subscriptionCancelsAtPeriodEnd({
      id: "sub_custom_date",
      cancel_at: 1_701_000_000,
    }, {
      current_period_end: 1_702_592_000,
    })).toBe(false);
  });
});
