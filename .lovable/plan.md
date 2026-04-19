

## Goal
Add consistent Amplitude event tracking across the app for **page views** and **button clicks**, using a clear naming convention.

## Naming convention

- **Page views**: `Page Viewed` with property `page_name` (e.g. `landing`, `landing_gitsound`, `auth`, `dashboard`, `project`, `share`, `pricing`, `checkout`, `checkout_return`, `onboarding`, `plugin`, `admin`, `not_found`).
- **Button clicks**: `Button Clicked` with properties `button_name` (snake_case), and `location` (page/component context).
- Use `Object Action` past-tense style consistently (Amplitude best practice).

Autocapture is already on, but explicit named events give clean, reportable funnels.

## Approach

**1. Create a tiny tracking helper** — `src/lib/analytics.ts`
- `trackPageView(page_name, props?)` → wraps `amplitude.track('Page Viewed', { page_name, ...props })`
- `trackButtonClick(button_name, location, props?)` → wraps `amplitude.track('Button Clicked', { button_name, location, ...props })`
- Centralizes event names so we don't typo them across files.

**2. Add a `usePageView` hook** — fires `Page Viewed` once per route mount.
- Drop one `usePageView('dashboard')` line at the top of every page component.

**3. Instrument page views** in all 13 pages:
- `LandingPage` → `landing`
- `LandingPageGithub` → `landing_gitsound`
- `Auth` → `auth`
- `Onboarding` → `onboarding`
- `Dashboard` → `dashboard`
- `ProjectPage` → `project`
- `SharePage` → `share`
- `PricingPage` → `pricing`
- `CheckoutPage` → `checkout`
- `CheckoutReturn` → `checkout_return`
- `PluginPage` → `plugin`
- `AdminPage` → `admin`
- `NotFound` → `not_found`

**4. Instrument key button clicks** (high-signal only — not every UI button). Naming examples:

| Location | button_name |
|---|---|
| `LandingPage` hero | `landing_hero_signup`, `landing_hero_see_how` |
| `LandingPage` nav | `landing_nav_signin`, `landing_nav_signup` |
| `LandingPage` final CTA | `landing_final_cta_signup` |
| `LandingPageGithub` (same set) | `landing_gitsound_*` mirror |
| `Auth` | `auth_submit_signin`, `auth_submit_signup`, `auth_google_continue`, `auth_toggle_mode` |
| `Onboarding` | `onboarding_complete`, `onboarding_skip` (if present) |
| `Dashboard` | `dashboard_new_project`, `dashboard_open_project`, `dashboard_upload_version` |
| `ProjectPage` | `project_upload_version`, `project_share_copy_link`, `project_add_collaborator`, `project_download_zip`, `project_delete` |
| `SharePage` | `share_download_zip`, `share_signup_cta` |
| `PricingPage` | `pricing_plan_selected` (with `plan` prop), `pricing_coming_soon_clicked` |
| `CheckoutPage` | `checkout_submit` |
| `Navbar` | `nav_pricing`, `nav_dashboard`, `nav_admin`, `nav_signout`, `nav_avatar_open` |
| `UploadModal` | `upload_modal_submit`, `upload_modal_cancel` |
| `ShareAfterUploadModal` | `share_after_upload_copy_link`, `share_after_upload_dismiss` |
| `SubmitPluginDialog` | `plugin_submit` |

**5. Optional identify call** — when a user signs in, call `amplitude.setUserId(user.id)` from `AuthContext` so events tie to the user. (Small add, big analytics value.)

## Files touched

- **New**: `src/lib/analytics.ts`, `src/hooks/usePageView.ts`
- **Edited (page view only, 1 line each)**: all 13 page files in `src/pages/`
- **Edited (button clicks)**: `LandingPage.tsx`, `LandingPageGithub.tsx`, `Auth.tsx`, `Dashboard.tsx`, `ProjectPage.tsx`, `SharePage.tsx`, `PricingPage.tsx`, `CheckoutPage.tsx`, `Onboarding.tsx`, `Navbar.tsx`, `UploadModal.tsx`, `ShareAfterUploadModal.tsx`, `SubmitPluginDialog.tsx`
- **Edited**: `src/contexts/AuthContext.tsx` (setUserId on auth state change)

## Out of scope

- No new dashboards in Amplitude — naming only.
- No tracking of low-value UI buttons (dropdown toggles, accordion expands, etc.) — autocapture already covers those.
- No event-property schema beyond `page_name`, `button_name`, `location`, and a few contextual props (`plan`, `project_id` where relevant — never PII).

