

## Project Review: Suggested Improvements

After reviewing the full codebase, here are the improvements I'd recommend, grouped by priority:

---

### High Priority — Bugs and UX Issues

**1. Auth page redirects to `/dashboard` instead of respecting onboarding state**
In `Auth.tsx` line 26, after login it navigates to `/dashboard` directly, bypassing the onboarding check. New users who sign up, verify email, then sign in will skip onboarding entirely. Fix: navigate to `/` (Index) which already handles the routing logic.

**2. Email invite in ShareAfterUploadModal is fake**
The "Send invite" button just shows a toast — it doesn't actually send an email or create a collaborator record. This should either be wired up to a backend function or the UI should be changed to "Copy link" only.

**3. ProtectedRoute doesn't redirect un-onboarded users**
A user who hasn't completed onboarding can manually navigate to `/dashboard` or `/project/:id`. The `ProtectedRoute` only checks for authentication, not onboarding status. Consider redirecting to `/onboarding` when `onboardingCompleted` is false.

**4. No landing page**
The `/` route is just a redirect router. There's no public-facing page explaining what TunesFork is. New visitors go straight to the auth page with no context.

---

### Medium Priority — Polish and Consistency

**5. Profile "Create on signup" trigger is missing**
The code queries `profiles.onboarding_completed` on login, but there's no visible trigger or edge function to auto-create a profile row when a user signs up. If a profile doesn't exist, `onboarding_completed` defaults to `undefined`/null, which could cause issues.

**6. Navbar "Profile" link goes to `/dashboard`**
The user dropdown has a "Profile" option that navigates to `/dashboard` — there's no actual profile/settings page. Either add one or remove the misleading menu item.

**7. Theme toggle not on Auth/Onboarding pages**
The theme toggle lives in the Navbar, which only appears on Dashboard and ProjectPage. The Auth and Onboarding pages have no way to switch theme.

**8. Missing `logo.png`**
Both Auth and Navbar reference `/logo.png` but this file isn't in the `public/` directory. This will show a broken image.

---

### Lower Priority — Code Quality

**9. Duplicated comment-fetching logic in ProjectPage**
The comment-fetch logic (with profile resolution) appears in both `useEffect` and `handleSendComment`. Extract to a shared function.

**10. `any` types in SharePage**
`project` and `version` are typed as `any`. Should use the generated Supabase types.

**11. No error handling on onboarding save failure**
In `Onboarding.tsx`, if the insert fails the user is stuck — no toast or retry option.

---

### Recommended Next Steps

I'd suggest tackling items 1-4 first as they directly impact user experience. Want me to implement any or all of these?

