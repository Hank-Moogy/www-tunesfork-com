
# Phase 1: Make Tunesfork Sync downloadable

Goal: a single click on `/desktop-app` gives the visitor an installer for their OS, hosted free on GitHub Releases. Unsigned builds, with clear "first-launch" instructions to bypass Gatekeeper / SmartScreen warnings.

## What changes

### 1. Switch packaging to `electron-builder`

Replace `@electron/packager` in `electron/package.json`:

- Remove dep: `@electron/packager`
- Add devDep: `electron-builder`
- New scripts:
  - `dist:mac` → `npm run build:ui && electron-builder --mac --universal`
  - `dist:win` → `npm run build:ui && electron-builder --win --x64`
  - `dist` → builds for current OS

Add a `build` block to `package.json` configuring electron-builder:

```json
"build": {
  "appId": "com.tunesfork.sync",
  "productName": "Tunesfork Sync",
  "directories": { "output": "release" },
  "files": ["main.cjs", "preload.cjs", "als-parser.cjs", "dist/**", "src/**", "node_modules/**"],
  "mac": {
    "category": "public.app-category.music",
    "target": [{ "target": "dmg", "arch": ["universal"] }],
    "identity": null,
    "icon": "build/icon.icns"
  },
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "icon": "build/icon.ico"
  },
  "nsis": { "oneClick": true, "perMachine": false }
}
```

`identity: null` skips macOS code-signing (unsigned, alpha-only).

Add placeholder icons under `electron/build/` (`icon.icns`, `icon.ico`, `icon.png`) — I'll generate them from the existing app logo if available, otherwise a temporary Tunesfork "T" mark.

### 2. Build & publish workflow (manual for Phase 1)

CI is Phase 3. For now, you (the maintainer) build locally:

```bash
cd electron
npm install
npm run dist:mac     # produces release/Tunesfork Sync-0.1.0-alpha.1-universal.dmg
npm run dist:win     # produces release/Tunesfork Sync Setup 0.1.0-alpha.1.exe
                     # (cross-compile from macOS with `--win`; requires wine for icon embedding,
                     #  or build on Windows directly)
```

Then upload both files to a GitHub Release. README in `electron/` will document the exact steps and naming convention so URLs stay stable.

### 3. GitHub repo & release naming convention

Assumption: repo lives at `https://github.com/<owner>/<repo>` (you'll tell me the slug after approval, or I'll put a `TODO_GITHUB_SLUG` placeholder).

Each release tag matches the electron app version, e.g. `v0.1.0-alpha.1`.

Asset filenames must be predictable so the static download page can link to "latest":

- `Tunesfork-Sync-mac-universal.dmg`
- `Tunesfork-Sync-win-x64.exe`

We rename outputs at upload time (or set `artifactName` in electron-builder config). Static URL pattern:

```
https://github.com/<owner>/<repo>/releases/latest/download/Tunesfork-Sync-mac-universal.dmg
https://github.com/<owner>/<repo>/releases/latest/download/Tunesfork-Sync-win-x64.exe
```

GitHub auto-redirects `/releases/latest/download/<asset>` to the newest release — zero backend, zero edge function.

### 4. Rework `src/pages/DesktopAppPage.tsx`

Replace the current "waitlist" hero with a real download experience (keep the waitlist form below as a secondary "notify me about updates" capture).

- Detect OS from `navigator.userAgent` / `navigator.platform` → `mac` | `windows` | `other`
- Hero shows one big primary CTA matching detected OS:
  - "Download for Mac (Apple Silicon + Intel)" → `.dmg` URL
  - "Download for Windows" → `.exe` URL
- Below the primary button, a small "Other platforms" row with both links always visible
- Track downloads via `trackButtonClick("desktop_download", "desktop_app", { platform })`
- Add a version label ("v0.1.0 alpha · unsigned build") under the button
- Add an expandable "First launch instructions" panel:
  - **macOS**: "Right-click the app → Open → Open. Required once because the build is unsigned. We're getting an Apple Developer ID soon."
  - **Windows**: "Click 'More info' → 'Run anyway' on the SmartScreen prompt."

Keep the existing 3-card "what it does" section and "How it works" steps — just below the new download hero.

Constants for URLs go in `src/lib/desktopDownload.ts` so we have one place to bump the version / repo slug later.

### 5. Update `OpenInAbletonButton` fallback dialog

The existing fallback dialog already routes to `/desktop-app` — no change needed, but its copy gets a small refresh: instead of "install it once", say "Download Tunesfork Sync (Mac or Windows)".

## Out of scope (later phases)

- **Phase 2**: Code signing (Apple Developer ID, Windows EV cert), notarization, auto-updates via `electron-updater`
- **Phase 3**: GitHub Actions CI to build + publish on tag push
- **Phase 4**: `get-desktop-release` edge function for live release notes / version display

## Technical notes

- `electron-builder` cross-compile from macOS → Windows works for `.exe` (NSIS) but Linux → macOS `.dmg` needs `hdiutil` (macOS-only). You'll need to run `dist:mac` on a Mac, `dist:win` on either Mac or Windows.
- The current `package.json` ships `tunesfork://` deep-link registration via `app.setAsDefaultProtocolClient` — already in `main.cjs`, so installer registration "just works" on first launch.
- Unsigned macOS DMGs trigger Gatekeeper. Right-click → Open is the documented bypass and works as long as the app isn't quarantined-and-translocated. Document clearly on download page.
- `src/integrations/supabase/client.ts` and `.env` not touched.

## Files to add / edit

- `electron/package.json` — swap packager → builder, add `build` block, new scripts
- `electron/build/icon.icns`, `icon.ico`, `icon.png` (new) — app icons
- `electron/README.md` — update build/release instructions
- `src/pages/DesktopAppPage.tsx` — new hero with OS-detected download button + first-launch instructions
- `src/lib/desktopDownload.ts` (new) — URL/version constants, OS detection helper
- `src/components/OpenInAbletonButton.tsx` — minor copy refresh

## One thing I need from you

The **GitHub repo slug** (e.g. `tunesfork/tunesfork-sync`) where releases will live. If you haven't created the repo yet, I'll wire the page with a `TODO_GITHUB_SLUG` constant you can fill in once you do.
