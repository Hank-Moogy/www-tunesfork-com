

## Plan: Install Amplitude Analytics + Session Replay

### Overview
Add Amplitude unified SDK to track all user interactions with autocapture and session replay, initialized once at app startup.

### Steps

**1. Install package**
- `npm install @amplitude/unified`

**2. Initialize Amplitude in `src/main.tsx`**
- Import `@amplitude/unified`
- Call `amplitude.initAll('65f72e75c1b338c180eaf8954f63104e', { analytics: { autocapture: true }, sessionReplay: { sampleRate: 1 } })` before `createRoot`
- This captures all page views, clicks, form submissions, and sessions automatically with zero additional instrumentation needed

**3. Verify**
- After deployment, fire a few events (visit pages, click buttons) and confirm data appears in your Amplitude dashboard

### Technical Notes
- Autocapture handles all click, navigation, and form events automatically — no manual event calls needed for baseline tracking
- Session Replay at `sampleRate: 1` records 100% of sessions
- Single initialization in `main.tsx` ensures it runs once, client-side only
- The API key (`65f72e75c1b338c180eaf8954f63104e`) is a publishable client key, safe to include in source code

