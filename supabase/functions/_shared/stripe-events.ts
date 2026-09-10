export type StripeIdReference = string | { id: string } | null;

export interface SubscriptionItemPayload {
  current_period_start?: number;
  current_period_end?: number;
  price?: {
    id?: string;
    lookup_key?: string | null;
    product?: StripeIdReference;
  };
}

export interface SubscriptionPayload {
  id: string;
  customer?: StripeIdReference;
  status?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: { userId?: string; lookupKey?: string };
  items?: { data?: SubscriptionItemPayload[] };
}

export interface InvoicePayload {
  subscription?: StripeIdReference;
  parent?: { subscription_details?: { subscription?: StripeIdReference } };
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

export function subscriptionPeriod(
  subscription: SubscriptionPayload,
  item?: SubscriptionItemPayload,
): { start: string | null; end: string | null } {
  const start = subscription.current_period_start ?? item?.current_period_start;
  const end = subscription.current_period_end ?? item?.current_period_end;
  return {
    start: start ? new Date(start * 1000).toISOString() : null,
    end: end ? new Date(end * 1000).toISOString() : null,
  };
}

export function invoiceSubscriptionId(invoice: InvoicePayload): string | null {
  return stripeObjectId(invoice.subscription) ||
    stripeObjectId(invoice.parent?.subscription_details?.subscription);
}
