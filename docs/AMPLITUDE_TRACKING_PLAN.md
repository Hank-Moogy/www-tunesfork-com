# Amplitude Tracking Plan — TunesFork

This is the canonical reference for all analytics events fired from the app. If you add a new event, update this file in the same PR.

## Naming convention

- **Event names**: `Object Action` in past tense, Title Case (e.g. `Page Viewed`, `Button Clicked`, `Signup Completed`).
- **Property names**: `snake_case` (e.g. `page_name`, `button_name`, `utm_source`).
- **Identifier values**: lowercase `snake_case` (e.g. `landing_hero_signup`, `dashboard_new_project`).
- **Never include PII** in event properties (no email, no display name). User identity is attached via Amplitude `user_id` only.

## Auto-attached properties

These ride along with **every** `Page Viewed` and `Button Clicked` event automatically (via `getUtmProps()`):

| Property | Source | Lifetime |
|---|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | URL params on landing | Session (sessionStorage) |
| `referrer` | `document.referrer` on first visit | Session |
| `landing_page` | First path visited in the session | Session |

## User properties

Set on the Amplitude user once `user_id` is identified.

| Property | Type | Notes |
|---|---|---|
| `initial_utm_source/medium/campaign/term/content` | first-touch (`setOnce`) | Never overwritten — first attribution wins |
| `utm_source/medium/campaign/term/content` | last-touch (`set`) | Updated whenever new UTMs hit the URL |
| `initial_referrer`, `initial_landing_page` | first-touch | First session entry point |

User ID is set from Supabase `user.id` on login (`identifyUser`) and reset on signout.

---

## Events

### `Page Viewed`
Fires once per route mount via `usePageView(page_name)`.

**Properties**: `page_name` (string), plus all auto-attached UTM props.

| `page_name` | Route |
|---|---|
| `landing` | `/welcome` |
| `landing_gitsound` | `/welcome/gitsound` |
| `auth` | `/auth` |
| `onboarding` | `/onboarding` |
| `dashboard` | `/dashboard` |
| `project` | `/project/:id` |
| `share` | `/share/:token` |
| `pricing` | `/pricing` |
| `checkout` | `/checkout` |
| `checkout_return` | `/checkout/return` |
| `plugin` | `/plugin/:slug` |
| `admin` | `/admin` |
| `not_found` | 404 catch-all |

### `Button Clicked`
Fires on high-signal CTA / nav clicks via `trackButtonClick(button_name, location, props?)`.

**Properties**: `button_name`, `location`, plus optional context (`plan`, `project_id`, etc.) and auto-attached UTMs.

| `location` | `button_name` |
|---|---|
| `landing` | `landing_hero_signup`, `landing_hero_see_how`, `landing_nav_signin`, `landing_nav_signup`, `landing_final_cta_signup` |
| `landing_gitsound` | `landing_gitsound_*` (mirror of landing) |
| `auth` | `auth_submit_signin`, `auth_submit_signup`, `auth_google_continue`, `auth_toggle_mode` |
| `onboarding` | `onboarding_complete`, `onboarding_skip` |
| `dashboard` | `dashboard_new_project`, `dashboard_open_project`, `dashboard_upload_version` |
| `project` | `project_upload_version`, `project_share_copy_link`, `project_add_collaborator`, `project_download_zip`, `project_delete` |
| `share` | `share_download_zip`, `share_signup_cta` |
| `pricing` | `pricing_plan_selected` (+ `plan` prop), `pricing_coming_soon_clicked` |
| `checkout` | `checkout_submit` |
| `navbar` | `nav_pricing`, `nav_dashboard`, `nav_admin`, `nav_signout`, `nav_avatar_open` |
| `upload_modal` | `upload_modal_submit`, `upload_modal_cancel` |
| `share_after_upload_modal` | `share_after_upload_copy_link`, `share_after_upload_dismiss` |
| `submit_plugin_dialog` | `plugin_submit` |

### `Signup Completed`
Fires from `AuthContext` on the **first** `SIGNED_IN` event for a user whose `created_at` is within the last 60 seconds. Deduped per session via `sessionStorage` flag `tf_signup_fired_<userId>`.

**Properties**:
- `method` — `"email"` or `"google"`
- All auto-attached UTM props (so you can attribute signups to the campaign that brought them)

### `Signin Completed`
Fires from `AuthContext` on `SIGNED_IN` for returning users (account older than 60s). Deduped per session.

**Properties**:
- `method` — `"email"` or `"google"`
- Auto-attached UTM props

---

## Funnel examples

### Acquisition funnel
1. `Page Viewed` (`page_name = landing`)
2. `Button Clicked` (`button_name = landing_hero_signup`)
3. `Page Viewed` (`page_name = auth`)
4. `Signup Completed`
5. `Page Viewed` (`page_name = onboarding`)
6. `Button Clicked` (`button_name = onboarding_complete`)
7. `Page Viewed` (`page_name = dashboard`)

Segment by `utm_source` to compare channel performance.

### Activation funnel
1. `Signup Completed`
2. `Button Clicked` (`button_name = dashboard_new_project`)
3. `Button Clicked` (`button_name = upload_modal_submit`)
4. `Button Clicked` (`button_name = project_share_copy_link`)

### Monetization funnel
1. `Button Clicked` (`button_name = nav_pricing`)
2. `Page Viewed` (`page_name = pricing`)
3. `Button Clicked` (`button_name = pricing_plan_selected`, `plan = pro`)
4. `Page Viewed` (`page_name = checkout`)
5. `Button Clicked` (`button_name = checkout_submit`)
6. `Page Viewed` (`page_name = checkout_return`)

---

## How to add a new event

1. Add a helper to `src/lib/analytics.ts` (auto-merge UTMs via `getUtmProps()`).
2. Call it from the relevant component / context.
3. Document it in this file under **Events** with its properties.
4. Use the naming convention: `Object Action` past tense, `snake_case` properties.
