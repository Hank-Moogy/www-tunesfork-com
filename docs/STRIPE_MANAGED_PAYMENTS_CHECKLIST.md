# TunesFork Stripe Managed Payments launch checklist

This checklist is sandbox-first. Do not configure live mode, create live charges, or deploy shared Supabase state until the storage-migration task confirms the project is clear.

## Planner decision

The official Stripe implementation planner was run against **TunesFork sandbox** (`livemode: false`). For this international B2C SaaS:

- use Stripe Billing with fixed recurring Prices and Stripe-hosted Checkout;
- enable Managed Payments so Stripe is merchant of record;
- keep subscription self-service in Customer Portal;
- cancel at period end by default;
- enable Smart Retries, failed-payment emails, and automatic card updates;
- use subscription-generated invoices rather than building a separate recurring invoicing loop.

Managed Payments is preview-gated. It is not compatible with TunesFork's former embedded Checkout path. The stable integration baseline is `2026-02-25.clover`, while Checkout requests that set `managed_payments[enabled]=true` must use the current Managed Payments preview version enabled for the Stripe account. Stripe's current setup guide shows `2026-03-04.preview`; verify the activated account's documentation before every production rollout.

## Sandbox catalog

Create three recurring-service products. Set an appropriate digital SaaS tax category and keep each price's lookup key exact.

| Product | Amount | Interval | Lookup key |
|---|---:|---|---|
| Producer | €7.99 | month | `producer_monthly` |
| Producer | €79 | year | `producer_yearly` |
| Founding Producer | €4.99 | month | `founding_producer_monthly` |
| Founding Producer | €49 | year | `founding_producer_yearly` |
| Studio | €29 | month | `studio_monthly` |
| Studio | €290 | year | `studio_yearly` |

For consumer-facing advertised prices, configure the Stripe tax behavior consistently with the displayed totals. If the amounts above are intended as the final VAT-inclusive customer prices, set the Prices/default tax behavior to inclusive. Confirm this choice with the business's accountant before live activation.

Before testing, verify every Price is active, recurring, EUR, has interval count 1, and has exactly one matching lookup key. The server refuses checkout when any catalog value drifts from this contract.

## Managed Payments activation

In the sandbox Dashboard:

1. Confirm TunesFork's digital SaaS products are eligible for Managed Payments.
2. Accept the Managed Payments terms for the business account.
3. Complete the required French EI/micro-entreprise business and payout details directly in Stripe.
4. Enable Managed Payments for sandbox transactions.
5. Confirm the preview API version currently required by the account.
6. Leave payment-method selection dynamic; Managed Payments controls eligible methods.

Never place business identity documents, API keys, webhook signing secrets, or account verification data in source, chat, logs, or Git.

## Supabase configuration

Set these in the Supabase project's secret/config store, not in repository files:

| Name | Sandbox setting |
|---|---|
| `STRIPE_ENVIRONMENT` | `sandbox` |
| `PUBLIC_SITE_URL` | `https://www.tunesfork.com` |
| `STRIPE_SANDBOX_API_KEY` | sandbox secret value entered directly in Supabase |
| `PAYMENTS_SANDBOX_WEBHOOK_SECRET` | sandbox endpoint signing secret entered directly in Supabase |
| `STRIPE_MANAGED_PAYMENTS_API_VERSION` | current account-enabled Managed Payments preview version |

Do not set `STRIPE_ENVIRONMENT=live`, a live API key, or a live webhook secret during sandbox acceptance.

The release migration `20260901170000_stripe_launch_hardening.sql` provides the webhook idempotency and founding-capacity tables and must already be applied. Then deploy only:

- `create-managed-checkout`
- `checkout-session-status`
- `get-stripe-price`
- `create-portal-session`
- `payments-webhook`

Coordinate this migration and function deployment with the storage task first; these instructions do not authorize a shared Supabase deployment.

## Vercel configuration

Set these through Vercel's environment settings:

| Name | Scope |
|---|---|
| `VITE_PAYMENTS_CLIENT_TOKEN` | sandbox/preview publishable client token |
| `VITE_FOUNDING_PRICES_ENABLED` | optional UI flag; omit or set `true` during the founding offer |

The client token selects the UI's sandbox label only. The server's `STRIPE_ENVIRONMENT` is authoritative and rejects a mismatch.

## Sandbox webhook

Create one sandbox webhook endpoint:

`https://urrxrntdkmmmqqwaihfj.supabase.co/functions/v1/payments-webhook?env=sandbox`

Subscribe to exactly:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the endpoint signing secret directly into `PAYMENTS_SANDBOX_WEBHOOK_SECRET`. Webhook handlers verify the raw-body signature and timestamp, claim each `(environment, event_id)` once, and release failed claims so Stripe can retry.

## Customer Portal and revenue recovery

Configure the sandbox Customer Portal to allow:

- invoice history and receipt access;
- payment-method updates;
- switches between active Producer and Studio monthly/yearly Prices;
- cancellation at period end;
- return to `https://www.tunesfork.com/billing`.

Do not expose Founding Producer Prices as a destination for existing standard customers. Existing founding subscriptions retain their Price until the customer changes plan or cancels.

Enable Billing revenue recovery:

- Smart Retries;
- failed-payment customer emails;
- automatic card updates;
- the desired final state after retries are exhausted (recommended: cancel, after accountant/business review).

## Founding-price transition

When the founding offer closes:

1. Set `VITE_FOUNDING_PRICES_ENABLED=false` and deploy the web app.
2. Archive/deactivate both founding Prices in the Stripe catalog; never delete or rewrite them.
3. Keep existing founding subscriptions on their current Price.
4. Keep founding Prices out of Customer Portal plan-switch destinations.
5. Verify new checkout attempts use only `producer_monthly`, `producer_yearly`, `studio_monthly`, or `studio_yearly`.

## Sandbox acceptance tests

Run all of these before considering live mode:

1. Monthly and yearly checkout for Producer, Founding Producer, and Studio.
2. Successful card and required-3DS scenarios through Stripe-hosted Checkout.
3. Customer cancellation before payment returns to Pricing and creates no subscription.
4. Checkout return is not shown as successful for a missing, foreign, open, expired, or malformed Session ID.
5. A completed session creates/updates the correct `subscriptions` row with the exact lookup key and `environment=sandbox`.
6. Re-delivering the same webhook event does not duplicate or regress data.
7. A failed invoice marks the local subscription `past_due`; Billing shows recovery guidance and opens Customer Portal.
8. Portal cancellation sets `cancel_at_period_end`; access continues until the recorded period end.
9. A deleted subscription becomes `canceled` locally.
10. A sandbox client request cannot select the live server environment, and no live key is required.
11. An existing active, trialing, incomplete, paused, unpaid, or past-due subscription is sent to Billing instead of creating a duplicate subscription.
12. After the founding transition, existing founding subscribers retain access while new founding checkouts are unavailable.

Only after this matrix passes should the live catalog, live webhook endpoint, live secrets, and live Managed Payments activation be prepared as a separate reviewed change.
