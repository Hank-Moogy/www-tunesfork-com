

## Tracking plan — what's currently instrumented

Here's the full naming reference for events already firing from the app, plus the gap on signup tracking and how to fix it.

### Event 1: `Page Viewed`
Fires once on every route mount. Properties:
- `page_name` — one of the values below
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` — auto-attached from session
- `referrer`, `landing_page` — auto-attached

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
| `not_found` | 404 |

### Event 2: `Button Clicked`
Properties: `button_name`, `location`, all UTM props, plus optional context (`plan`, `project_id`, etc.).

| `location` | `button_name` values |
|---|---|
| `landing` | `landing_hero_signup`, `landing_hero_see_how`, `landing_nav_signin`, `landing_nav_signup`, `landing_final_cta_signup` |
| `landing_gitsound` | `landing_gitsound_*` (mirror set) |
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

### User properties (already set)
- `initial_utm_source/medium/campaign/term/content` — first-touch (setOnce)
- `utm_source/medium/campaign/term/content` — last-touch
- `initial_referrer`, `initial_landing_page`
- Amplitude `user_id` set from Supabase `user.id` on login

---

## The signup gap

Right now signup is tracked **indirectly** via `Button Clicked` (`auth_submit_signup`, `auth_google_continue`). That fires on **intent**, not on **success** — so it counts failed signups (bad email, password too short, OAuth cancelled) and double-counts retries.

**Recommended additions** for clean funnels:

### Event 3: `Signup Completed` (NEW)
Fire from `AuthContext` when `onAuthStateChange` sees a brand-new user (event = `SIGNED_IN` + `created_at` within last few seconds, OR explicitly on `SIGNED_UP` if available).
Properties: `method` (`email` | `google`), all UTM props.

### Event 4: `Signin Completed` (NEW)
Fire from `AuthContext` on returning-user login.
Properties: `method`.

### Why split them
In Amplitude you'd build:
- **Acquisition funnel**: `Page Viewed (landing)` → `Button Clicked (landing_hero_signup)` → `Page Viewed (auth)` → `Signup Completed` → `Page Viewed (onboarding)` → `Onboarding Completed`.
- Segment by `utm_source` to see which channel converts best.

---

## Plan: add the two missing lifecycle events + a small reference doc

**1. Extend `src/lib/analytics.ts`**
- Add `trackSignupCompleted(method)` and `trackSigninCompleted(method)` helpers.
- Both auto-merge UTM props (same pattern as existing helpers).

**2. Wire into `src/contexts/AuthContext.tsx`**
- In `onAuthStateChange`:
  - On `SIGNED_IN`, compare `user.created_at` vs `Date.now()`. If <60s ago and we haven't fired before for this user → `Signup Completed`. Else → `Signin Completed`.
  - Detect method from `user.app_metadata.provider` (`email` or `google`).
- Use a `sessionStorage` flag (`tf_signup_fired_<userId>`) to avoid duplicate fires on tab switches.

**3. Create `docs/AMPLITUDE_TRACKING_PLAN.md`**
- The full table above as a single reference file in the repo so you / future contributors don't have to dig through code.
- Includes: event names, property schema, naming convention rules, how to add a new event.

### Files touched
- `src/lib/analytics.ts` — add 2 helpers
- `src/contexts/AuthContext.tsx` — fire signup/signin completed
- `docs/AMPLITUDE_TRACKING_PLAN.md` — new reference doc

### Out of scope
- No tracking for comments / version uploads / collaborator added as backend events (those still fire as button clicks today — can add as a follow-up if you want server-side truth).
- No Amplitude dashboard/chart creation — naming + code only.

