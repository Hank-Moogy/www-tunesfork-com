# Amplitude Launch Instrumentation

Status: web and Electron renderer implementation complete; project-side
dashboards and ingestion alerts require Amplitude account access.

`shared/analytics-events.ts` is the canonical typed, versioned semantic event
registry. TypeScript rejects unknown manual events and a test scans Electron
main-process IPC emissions for undocumented names.

Both surfaces use environment-provided API keys/zones, initialize once, queue
early events for at most three seconds, capture all supported browser
interactions and performance signals, and record 100% of eligible session
replays. The non-secret UI is explicitly unmasked. Passwords, Stripe fields,
device/auth tokens, signed storage URL query strings, and raw local paths are
blocked or redacted as credential-security boundaries.

The immutable Supabase UUID is `user_id`. Verified email, domain, plan, storage,
onboarding, app surface, app version, and acquisition properties are refreshed
on authenticated sessions. Anonymous device/session identity is preserved at
sign-in; `reset()` runs only for explicit logout. Desktop identity is returned
by authenticated pairing and refreshed at each launch.

Each authenticated Amplitude session emits exactly one `Authenticated Session
Started`, deduplicated by `user_id + amplitude_session_id`. Semantic events cover
landing, signup/signin, download, pairing, folder selection, import, save,
negotiate/upload, restore, share/invite, pricing/checkout, subscription/payment,
and quota warnings/rejections. Stripe webhooks send verified revenue lifecycle
events with the same Supabase UUID and email.

Before launch, create and validate these account-side assets:

- acquisition, download/pairing, activation/share, and paid funnels;
- upload success/deduplication and storage pressure by plan;
- web versus desktop engagement;
- frustration/errors linked to replay;
- new-user and failed-activation replay cohorts;
- paid conversion/cancellation cohorts and lookup by email;
- alert when replay-linked eligible sessions fall below 95%.

Validate anonymous-to-user stitching, replay playback, cross-tab login, second
Mac pairing, email/token refresh, offline queueing, ad blockers, and logout/login
as another account. Record the configured replay retention in the launch
runbook; no automatic sampling reduction is permitted.
