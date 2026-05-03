# Open in Ableton — CTA from the web

## How it works

Browsers cannot launch native apps like Ableton directly. The standard, secure pattern is:

1. The TunesFork desktop app registers a **custom URL protocol** (`tunesfork://`) with the OS.
2. The website renders an "Open in Ableton" button that points to `tunesfork://open-project/<projectId>?version=<versionId>`.
3. Clicking the button hands the URL to the OS, which launches the desktop app and passes the parameters.
4. The desktop app downloads the latest `.als`, links plugins, and opens it in Ableton (or focuses the project if already synced locally).
5. If the user does not have the app installed, we fall back to the existing `/desktop-app` download page.

```text
Browser  ──tunesfork://open-project/abc?version=xyz──▶  OS  ──▶  Electron app  ──▶  Ableton (.als)
                                                                       │
                              fallback (no handler) ──▶ /desktop-app ──┘
```

## What to build

### 1. Desktop app — register the protocol
- In `electron/main.cjs`, register `tunesfork://` as a protocol handler:
  - macOS: `app.setAsDefaultProtocolClient('tunesfork')` + handle `open-url` event.
  - Windows/Linux: same API + handle `second-instance` (deep-link arrives in `argv`).
- Parse incoming URLs (`open-project/:projectId`, optional `?version=`).
- Reuse the existing sync/linker pipeline to:
  - Pull the requested version's zip,
  - Run plugin linking,
  - Open the resulting `.als` via `shell.openPath()`.
- Show a tray notification while it works, surface errors in the tray UI.

### 2. Web — "Open in Ableton" CTA
- New component `OpenInAbletonButton.tsx` used on `ProjectPage.tsx` (and optionally on the version row in the version history).
- Click behavior:
  - Set `window.location.href = "tunesfork://open-project/<id>?version=<vid>"`.
  - Start a 1.5 s timer; if the page is still visible (i.e. the OS didn't hand off), show a small dialog: "Looks like the desktop app isn't installed" with a link to `/desktop-app`.
  - Use the standard "page visibility / blur" trick so the fallback doesn't fire when handoff actually succeeded.
- Track the click in analytics (`open_in_ableton_clicked`).

### 3. UX detail — first-run consent
- Browsers (especially Chrome/Safari) prompt the user the first time to confirm "Open TunesFork?". That's expected and handled by the OS — no extra work.
- Add a subtle helper text under the button on first visit: "Requires TunesFork desktop app".

### 4. Optional polish (not required for v1)
- Detect installation hint via a `localStorage` flag set by the desktop app on a paired sign-in (we already have device pairing) so we can hide the fallback dialog for known installs.
- Add an "Open latest in Ableton" item to the project card menu on the dashboard.

## Files touched

- `electron/main.cjs` — protocol registration + deep-link handling.
- `electron/src/sync.ts` (or `linker.ts`) — small helper to fetch + open a specific version on demand.
- `src/components/OpenInAbletonButton.tsx` — new.
- `src/pages/ProjectPage.tsx` — render the CTA in the header.
- `src/lib/analytics.ts` — new event id.

## Out of scope

- Two-way "save back to TunesFork from Ableton" — already handled by the existing watcher/auto-sync.
- Web-only opening of `.als` files (not feasible; Ableton has no web runtime).
