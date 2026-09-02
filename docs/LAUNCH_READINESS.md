# Tunesfork Launch Readiness

## Implemented in this change

- Incremental, owner-scoped manifest storage; quotas/reservations; physical and
  logical usage; refreshable restores; version/project deletion; guarded GC.
- Maximum Amplitude web/Electron autocapture, 100% replay, authenticated email
  identity, typed taxonomy, upload economics, and server-side Stripe events.
- Producer (€7.99/€79), Founding Producer (€4.99/€49 for year one, first 100),
  and Studio (€29/€290) checkout routes; authenticated server-owned checkout;
  verified completion; idempotent webhooks; entitlements; Billing Portal and
  founding-to-Producer schedule.
- Universal macOS hardened-runtime build, Developer ID enforcement,
  notarization/stapling, strict validation, checksum generation, quarantine
  smoke test, and tag-driven release workflow.

## Required deployment order

1. Back up the database and deploy migrations `20260901160000` and
   `20260901170000` in staging. Deploy all changed Edge Functions.
2. Configure staging secrets: `STRIPE_ENVIRONMENT=sandbox`, sandbox Stripe API
   and webhook secrets, `PUBLIC_SITE_URL`, `AMPLITUDE_API_KEY`,
   `AMPLITUDE_SERVER_ZONE`, and `CLEANUP_TOKEN`. Configure web and Electron
   builds with that environment's `VITE_AMPLITUDE_API_KEY`,
   `VITE_AMPLITUDE_SERVER_ZONE`, and `VITE_APP_VERSION`; production must use a
   different Amplitude project/API key.
3. Create all six Stripe recurring lookup keys exactly as referenced in code.
   Configure invoices, tax/VAT behavior, refunds, customer emails, and Billing
   Portal cancellation/update settings.
4. Run the storage acceptance matrix in staging, including quota boundaries,
   concurrency, resume/expiry, corrupt/missing blobs, deletion safety, legacy
   restore, and direct-client bypass attempts.
5. Validate all Amplitude events, profiles, replays, funnels/cohorts, and the
   95% replay-ingestion alert in the staging Amplitude project.
6. Repeat deployment with `STRIPE_ENVIRONMENT=live` and production-only keys.
   Register the live webhook URL with `?env=live`.
7. Complete Apple enrollment/certificate/notary-key setup, add the documented
   GitHub secrets, and push a signed version tag. Test the quarantined DMG on a
   clean Intel Mac and clean Apple Silicon Mac before publishing broadly.

Do not deploy the desktop build before its database migrations and Edge
Functions: ZIP fallback is intentionally disabled, so mismatched rollout order
will stop uploads instead of creating duplicate storage.
