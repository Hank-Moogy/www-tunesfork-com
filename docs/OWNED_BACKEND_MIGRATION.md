# Owned Backend Migration

This migration should be done in stages so the current Lovable-backed product
can keep working until the owned backend is proven.

## Goal

Move Tunesfork to infrastructure owned by Tunesfork while keeping the user
experience simple:

1. User downloads Tunesfork Sync.
2. User selects one or more folders that contain Ableton projects.
3. Tunesfork Sync imports the current state of each project once.
4. The same folders stay watched.
5. Future Ableton saves upload new versions for the matched project.

For the first migration, we intentionally do not preserve old comments,
old cloud version history, old share links, or old device tokens.

## Safe Rollback Rule

Until the owned backend is ready, do not change production env vars or release
new installers that point to the owned backend.

Rollback should be one of:

- Deploy the previous web frontend env vars.
- Re-publish the previous DMG release.
- Switch Electron defaults back to the old Supabase Functions URL.

## Phase 1: Product Flow

Status: started.

Tunesfork Sync should support one permanent setup flow:

```text
Select folders -> Initial import -> Keep watching -> Upload new versions
```

Implementation notes:

- The desktop app stores a local folder-to-project mapping in `state.json`.
- Initial import creates one cloud project per local Ableton project folder.
- Future saves include `project_id` when registering a new version.
- Running import again skips folders that are already linked.
- The app sends one desktop notification when the import completes.

## Phase 2: Owned Supabase Staging

Create a new Supabase project under the Tunesfork account.

Owned staging project ref:

```text
urrxrntdkmmmqqwaihfj
```

Local prerequisite:

```bash
brew install supabase/tap/supabase
supabase login
```

Run:

```bash
supabase link --project-ref urrxrntdkmmmqqwaihfj
supabase db push
supabase functions deploy
```

Status: linked, database pushed, functions deployed.

Required buckets:

- `project-zips` private
- `audio-previews` public
- `project-zips.file_size_limit` set to at least `524288000` so full Ableton
  project zips can upload through resumable storage.

Required frontend env vars:

```bash
VITE_SUPABASE_PROJECT_ID=urrxrntdkmmmqqwaihfj
VITE_SUPABASE_URL=https://urrxrntdkmmmqqwaihfj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<owned-publishable-key>
```

Required Electron build-time/runtime values:

```bash
TUNESFORK_URL=https://www.tunesfork.com
TUNESFORK_FUNCTIONS_URL=https://urrxrntdkmmmqqwaihfj.supabase.co/functions/v1
TUNESFORK_STATE_DIR=/tmp/tunesfork-sync-staging-state
```

Supabase secrets to configure before testing functions:

```bash
supabase secrets set PUBLIC_BASE_URL=https://www.tunesfork.com
supabase secrets set STRIPE_SANDBOX_API_KEY=...
supabase secrets set STRIPE_LIVE_API_KEY=...
supabase secrets set PAYMENTS_SANDBOX_WEBHOOK_SECRET=...
supabase secrets set PAYMENTS_LIVE_WEBHOOK_SECRET=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set EMAIL_FROM="Tunesfork <noreply@your-verified-domain>"
supabase secrets set EMAIL_SITE_NAME=Tunesfork
supabase secrets set EMAIL_PREVIEW_TOKEN=...
supabase secrets set SEND_EMAIL_HOOK_SECRET=...
supabase secrets set RESEND_WEBHOOK_SECRET=...
```

Do not set new production frontend env vars or Electron defaults until these
secrets and acceptance tests are complete.

## Phase 3: Replace Lovable-Owned Services

These pieces currently depend on Lovable-owned infrastructure or Lovable APIs.
Replace them before calling the backend fully owned.

- Google OAuth: configure Supabase Auth Google provider with a Tunesfork Google
  Cloud OAuth app. Code path has been switched to direct Supabase OAuth.
- Auth UI: replace `@lovable.dev/cloud-auth-js` usage with direct Supabase
  OAuth. Status: done in `src/pages/Auth.tsx`; unused Lovable auth package and
  bridge file removed.
- Email: replace Lovable email sender with Resend, Postmark, Mailgun, or SES.
  Status: queue processor uses Resend via `RESEND_API_KEY`; Supabase auth
  email hook now verifies Standard Webhooks via `SEND_EMAIL_HOOK_SECRET`;
  suppression webhook now verifies Resend/Standard Webhooks via
  `RESEND_WEBHOOK_SECRET`. Deployment is blocked until the Resend domain and
  secrets are configured.
- Stripe: replace Lovable Stripe gateway wrapper with direct Stripe API keys
  and direct webhook endpoints. Status: done in `_shared/stripe.ts`;
  Stripe functions redeployed to owned Supabase.

Known remaining Lovable references:

- Historical lockfile resolved URLs from the Lovable package cache.

## Phase 4: Staging Acceptance Tests

Test on the owned staging backend before release:

- New Google signup shows Tunesfork in the Google consent screen.
- Email/password signup works.
- Profile row is created.
- Desktop pair flow works.
- Select parent folder containing multiple Ableton projects.
- Initial import creates one project per folder.
- Large project import works for zips above 50 MB.
- A second import skips already linked folders.
- Saving a watched `.als` creates a new version instead of a duplicate project.
- Project download works.
- Open in Ableton deep link works.
- Stripe checkout and webhook update the database.
- Transactional email sends and unsubscribe works.

## Phase 5: User Cutover

Because there are only a few early users, do a user-assisted cutover:

1. Keep the old Lovable-backed product online.
2. Publish the new web frontend and new Tunesfork Sync release.
3. Message users to download the new app and select their Ableton project
   folders.
4. Ask for each user's import completion receipt.
5. Keep the old backend available read-only for a short grace period.
6. Retire the Lovable-backed backend only after all active users are migrated.

Suggested user message:

```text
We moved Tunesfork to infrastructure owned by Tunesfork. Please download the
new Tunesfork Sync, choose the folders where you keep your Ableton projects,
and click Import projects. It will upload your current projects once, then keep
syncing future saves automatically.
```
