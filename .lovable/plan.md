## Problem

On mobile, when an invitee taps a share link from inside an in-app browser (WhatsApp, Instagram, Messenger, LinkedIn, etc.), Google refuses the OAuth request with *"Access blocked: this request doesn't comply with Google's policy."* This is Google's `disallowed_useragent` policy — they block OAuth in embedded webviews. We can't bypass it; we have to route the user out of the embedded browser.

## Solution

Detect embedded webviews and:
1. Show a friendly banner telling the user to open the link in their real browser.
2. Provide a one-tap "Open in browser" helper (best-effort — varies per platform).
3. Hide / disable the Google button inside webviews so users don't hit the cryptic Google error, and steer them to email sign-up instead.

## Changes

### 1. New utility: `src/lib/inAppBrowser.ts`

Small helper that inspects `navigator.userAgent` to detect common embedded webviews:
- iOS: presence of `FBAN`/`FBAV` (Facebook/Messenger), `Instagram`, `Line`, `MicroMessenger`, `WhatsApp`, `LinkedInApp`, `Snapchat`, `TikTok`; or Safari-on-iOS *without* `Safari/` token (generic WKWebView).
- Android: `; wv)` token, or matches for `FB_IAB`, `Instagram`, `Line`, `MicroMessenger`, `WhatsApp`, `LinkedInApp`, etc.

Exports:
- `isInAppBrowser(): boolean`
- `getInAppBrowserName(): string | null` (for nicer messaging)
- `tryOpenInExternalBrowser(url: string): void` — best-effort: on Android tries an `intent://` URL, on iOS just copies the URL to clipboard and shows instructions (iOS has no reliable escape).

### 2. `src/pages/Auth.tsx`

- On mount, call `isInAppBrowser()`.
- If true: render an `Alert` at the top: *"You're using {AppName}'s in-app browser. Google sign-in is blocked here. Tap the menu (⋯ / ⋮) and choose 'Open in Chrome' or 'Open in Safari', or sign up with email below."* Include a small "Copy link" button.
- Disable the Google button in this state (with a tooltip explaining why) so users don't hit the Google error screen.
- Still allow email/password sign-up to proceed normally.

### 3. `src/pages/SharePage.tsx`

- Same detection at the top.
- When in an in-app browser, replace the two CTA buttons (`Sign up to accept invite` / `I already have an account`) with:
  - A prominent banner telling them to open in their real browser.
  - A "Copy invite link" button.
  - A secondary "Continue with email anyway" button that still routes to `/auth?invite=<token>` (email sign-up keeps working).

### 4. Optional: tighten share link generation

While we're here, update wherever `handleShare` builds the URL (likely in `ProjectPage.tsx` / share modal — to be confirmed) to always use `https://tunesfork.com` as the origin instead of `window.location.origin`. Prevents accidentally sharing a preview URL in the future. (Not the cause of *this* bug, but a good guardrail.)

## What this does *not* fix

- Google's policy itself — we cannot make Google OAuth work inside WhatsApp's webview. The only real fix is leaving the embedded browser. Our UI just makes that obvious instead of showing Google's scary error.
- Users who insist on staying in the in-app browser will need to use email/password sign-up.

## Files touched

- `src/lib/inAppBrowser.ts` (new)
- `src/pages/Auth.tsx`
- `src/pages/SharePage.tsx`
- (optional) `src/pages/ProjectPage.tsx` or wherever the share URL is constructed
