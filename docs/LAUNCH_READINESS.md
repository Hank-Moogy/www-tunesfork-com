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

---

# Onboarding: what must be tested before launch

The first-run flow (`src/pages/Onboarding.tsx`, `src/hooks/useOnboardingProgress.ts`)
has been built and reviewed on screen, but **its authenticated round-trip has
never been exercised end to end.** Progress is derived from real signals rather
than a stored counter, and three of those signals are produced outside the
browser — by the tray app and by Ableton. None of that can be verified from a
design review, from preview mode, or from the test suite.

Everything below needs a **fresh account** and a **real macOS install**. An
established account is already past the gate and will never see the flow.

## Must pass

| # | Test | Why it matters |
|---|---|---|
| 1 | Sign up. You land on `/onboarding` and cannot reach `/dashboard` by typing the URL. | The gate is the whole point. If it does not hold, nothing else here matters. |
| 2 | Enter a name. Success burst fires, lamp 1 fills, screen advances to Install. | The only step that completes inside the browser. |
| 3 | Click Download for macOS. The `.dmg` downloads **and the page stays on onboarding**, advancing to Pair. | This previously navigated to `/desktop-app` and abandoned the flow. Regression-prone. |
| 4 | Install and pair Sync. **Leave the browser tab open and untouched.** Within ~4s the screen advances to Back up on its own. | Polling for a signal produced in another application. Never verified. |
| 5 | Add a folder in Sync, open that project in Ableton, save. The screen advances by itself and hands you to the project page with the Share spotlight up. | The handoff. Two things must line up: the derived project signal, and the navigation after the success burst. |
| 6 | `/dashboard` now opens. The stepper shows steps 5 and 6. | The gate must release once the real work is done. |
| 7 | Share the project. Step 5 ticks. | Verifies `ensure_project_share_token` and the derived share signal agree. |
| 8 | Dismiss a step with its X, and the panel with its X. Reload. Both stay dismissed. | Persistence is `localStorage`; confirm it survives a reload and is per-browser, not per-account. |

## Must not trap

A setup flow that can only be left by finishing it becomes a trap the moment
anything goes wrong — and most of what can go wrong here is outside the browser.
These are the escape routes; each must work.

| # | Test | Expected |
|---|---|---|
| 9 | On any onboarding step, click "Skip for now, take me to my projects". | Lands on `/dashboard` and stays there, at any point in the flow. |
| 10 | Block requests to Supabase (DevTools → Network → offline), then load `/dashboard`. | After ~5s the dashboard renders. It must **not** spin forever or bounce to onboarding. |
| 11 | Sign in on **Windows or Linux**. | You reach the Windows waitlist step, can join it, and can enter the app. Sync is macOS-only and the web ZIP upload path is closed at the database, so a platform gate here would lock these users out permanently with no way back. |
| 12 | Pair a device, then revoke it, then reload. | You are not thrown back into onboarding. `onboarding_completed` should keep you out. |

## Known gaps

- **Steps 4 and 5 poll every 4 seconds while the user sits on them.** Fine for a
  handful of users; worth revisiting if signup volume grows.
- **Dismissals are per-browser, not per-account.** A user on a second machine
  sees the reminders again. Deliberate — it needs no migration — but if that
  reads as a bug, it needs a column.
- **The share signal counts any collaborator row**, not only one on a project the
  user owns. A user who was invited to someone else's project may see step 5
  already ticked.

## What is already covered

`npm run build`, `npm run test` (24 tests) and `npx eslint src` pass. Preview
mode (`?tf_preview=1`, DEV only) covers the appearance of every screen but
proves nothing about the signals. See `docs/DESIGN_SYSTEM.md`.
