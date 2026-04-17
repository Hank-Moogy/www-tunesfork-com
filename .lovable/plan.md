

## Status check

**Product**: TunesFork — Ableton backup + collaboration on Lovable Cloud. Core flows (auth, dashboard, upload, project page, sharing, pricing) are built. Payments infrastructure is in place but CTAs are intentionally "Coming Soon" until you test and claim Stripe live. A new producer-focused landing page is now the default at `/welcome`, with the technical "GitSound" version preserved at `/welcome/gitsound`.

**Open security findings** (from the security view):
1. ⚠️ `agent_security` — `zip_url_anon_rpc`: `get_versions_by_share_token` returns `pv.*`, leaking uploader UUIDs and storage paths to anonymous share-link visitors.
2. ⚠️ `agent_security` — `notif_unrestricted_send`: `create_notification` lets any authenticated user spam any other user's feed; no type allowlist, no length limit, no relationship check.
3. ⚠️ `agent_security` — `collab_lookup_by_name`: collaborator add uses partial `display_name` `ilike` match and silently picks the first hit → impersonation risk.
4. ⚠️ `supabase` — Leaked password protection disabled (Auth setting toggle).
5. ⚠️ `supabase` — Function search_path mutable (likely the `pgmq` helper functions without `SET search_path`).

The two finished items (`project_zips_broken_select_policy` and `projects_share_token_exposure`) still appear in the current snapshot but were addressed in the last two migrations — they should clear on the next scan.

## Recommendation: clear the security backlog before opening payments

You said you want to test flows and claim Stripe before flipping CTAs live. The right pre-launch sequence is: lock down security → end-to-end test → flip CTAs. Here's the order I'd tackle the remaining findings, grouped so each plan is a tight, reviewable change.

### Next plan (proposed): fix the 3 high-signal app-layer findings together

These are related (all about who can do what across users) and small enough to ship as one migration + one frontend change:

**A. Share-page info leak (`zip_url_anon_rpc`)**
- Rewrite `get_versions_by_share_token` to return an explicit column list excluding `zip_url` and `uploader_id`.
- Update `SharePage.tsx` types/usage if needed (it already only uses `track_list`, `plugin_list`, `audio_preview_url`, `change_note`, `file_size_bytes`).

**B. Notification spam (`notif_unrestricted_send`)**
- Add an allowlist of `notification_type` values inside `create_notification` (e.g. `new_version`, `new_collaborator`, `comment`, `share_accepted` — confirm the list with you).
- Cap `notification_message` at 500 chars.
- Add a relationship check: only allow if caller and target share at least one project (owner or collaborator on the same `project_id`).

**C. Collaborator impersonation (`collab_lookup_by_name`)**
- Add a `find_user_by_email(_email text)` SECURITY DEFINER RPC that returns `{ user_id, display_name, avatar_url }` for an exact email match, reading from `auth.users` server-side.
- Update `ProjectPage.tsx` `handleAddCollaborator`: switch the input to "email", call the RPC, show a confirmation card (avatar + display name + masked email) before inserting into `collaborators`.

### Then (separate, smaller follow-ups)

**D. Supabase Auth — Leaked password protection**
- Enable via `cloud--configure_auth` (one toggle, no code).

**E. Function search_path mutable**
- Add `SET search_path = public` (or `''` for SECURITY DEFINER) to the helper functions still missing it (`enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`).

### After security is clean

**F. End-to-end QA pass** before going live: signup → onboarding → upload `.als` → project page → invite collaborator → share link (incognito) → notifications → pricing.

**G. Stripe go-live + flip CTAs** from "Coming Soon" to live checkout (your earlier instruction was to wait until after testing and claiming the account — this is the moment).

## My pick for the next loop

Tackle **A + B + C in one go** — same theme (cross-user authorization), single migration, one frontend touch in `ProjectPage.tsx`, and it clears 3 of the 5 remaining findings.

If you'd rather, I can instead:
- Just do **A** (smallest, anonymous-data leak — arguably highest priority since it touches unauthenticated users), or
- Skip security and jump to **G** (go-live), or
- Do **D + E** first (one-click Supabase fixes).

