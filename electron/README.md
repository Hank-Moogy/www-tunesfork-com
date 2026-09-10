# Tunesfork Sync — Desktop App

Menu-bar Electron app that imports your current Ableton projects, then watches
those folders and uploads new versions to Tunesfork on every save.

## Develop locally

```bash
cd electron
npm install
npm run dev:all   # runs vite for the tray UI + electron in parallel
```

## Build distributable installers

Local macOS builds receive a stable ad-hoc hardened-runtime signature so Files
& Folders permissions and the `tunesfork://` protocol remain attached to
`com.tunesfork.sync` across rebuilds. Ad-hoc builds are for local testing only.
Because ad-hoc signatures have no Apple Team ID, local builds alone use a
separate entitlement that permits Electron's framework to load. Public builds
use `entitlements.mac.plist` without that exception.
Public releases must use a Developer ID Application certificate and Apple
notarization.

### macOS (run on a Mac)

```bash
npm run dist:mac
# → release/Tunesfork-Sync-mac-universal.dmg
```

`dist:mac` also verifies runtime dependencies, required app files, the macOS
bundle identifier/signature, and Files & Folders usage descriptions.

For a public build, install the Developer ID Application certificate in the
build Mac's keychain (or provide `CSC_LINK` and `CSC_KEY_PASSWORD`), then run:

```bash
APPLE_ID=... \
APPLE_APP_SPECIFIC_PASSWORD=... \
APPLE_TEAM_ID=... \
npm run dist:mac:release
```

App Store Connect API credentials are also supported through `APPLE_API_KEY`,
`APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. The release build refuses to
notarize an ad-hoc signature and staples the accepted ticket to the `.app`.
The release verifier then runs strict codesign validation, validates the
stapled ticket, asks Gatekeeper to assess the app, writes `SHA256SUMS.txt`, and
tests a copied app carrying a browser-style quarantine attribute.

The tag-triggered workflow in `.github/workflows/release-macos.yml` performs
the same build on a clean Apple Silicon runner. Configure these repository
secrets before creating a production tag: `MACOS_CERTIFICATE_BASE64`,
`MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, and `AMPLITUDE_PRODUCTION_API_KEY`.

Before the first public release, the founder must complete the one-time Apple
Developer enrollment, create the Developer ID Application certificate and
notary key, and run the resulting DMG manually on one clean Intel Mac and one
clean Apple Silicon Mac. On both machines verify pairing, Documents/Desktop
folder permission prompts, tray/background relaunch, `tunesfork://` opening,
uninstall/reinstall, and a full upload/restore round trip.

### Windows (run on Windows, or cross-compile from Mac)

```bash
npm run dist:win
# → release/Tunesfork-Sync-win-x64.exe
```

Cross-compile from macOS works for Windows. macOS DMGs require macOS
(`hdiutil`).

## Publish a release

1. Bump `version` in `electron/package.json` (e.g. `0.1.0-alpha.2`).
2. Build both installers using the commands above.
3. Create a new GitHub release with tag `v<version>` (e.g. `v0.1.0-alpha.2`).
4. Upload **both** assets, keeping the exact filenames produced by the build:
   - `Tunesfork-Sync-mac-universal.dmg`
   - `Tunesfork-Sync-win-x64.exe`
5. Publish the release. The download page on tunesfork.com automatically
   points at `/releases/latest/download/<asset>`, so it picks up the new
   release with no code change.

> **One-time setup:** the GitHub repo slug must be set in
> `src/lib/desktopDownload.ts` (`REPO_SLUG`). Until it's set, the download
> page falls back to the waitlist form.

## What's here

```
electron/
├── README.md              ← you are here
├── main.cjs               ← main process: tray icon, lifecycle, deep links
├── preload.cjs            ← exposes a safe API to the tray UI
├── als-parser.cjs         ← reads SampleRefs from .als files
├── package.json           ← electron-only deps + electron-builder config
└── src/
    ├── api.ts             ← talks to Tunesfork edge functions
    ├── auth.ts            ← OS keychain (keytar) + pair flow
    ├── watcher.ts         ← chokidar — watches *.als files
    ├── debouncer.ts       ← collapses Ableton's 2-3 writes per save into one event
    ├── projectFolder.ts   ← walks up from .als to find the Project folder
    ├── zipper.ts          ← streaming zip of Project folder (skips Backup/)
    ├── uploader.ts        ← TUS resumable upload to project-zips bucket
    ├── linker.ts          ← maps local Project folder → Tunesfork project_id
    ├── store.ts           ← persistent JSON store
    └── tray-ui/           ← React UI rendered in the tray window
```

## Backend it talks to

| Edge function | Purpose |
|---|---|
| `pair-device-init` | Get a 6-char pairing code + browser URL |
| `pair-device-confirm` | (browser-side) confirm the code |
| `pair-device-poll` | (desktop-side) poll until confirmed, receive token |
| `create-version-from-desktop` | Authenticated upload registration |

Plus storage bucket `project-zips` and DB tables `device_tokens`, `device_pair_codes`.

## Import and watch flow

Tunesfork Sync uses one setup flow for both existing and new users:

```text
Select folders -> Import current projects -> Keep watching for future saves
```

The first import scans the selected folders for Ableton project folders, uploads
each unlinked project once, and stores a local folder-to-project mapping in the
app's `state.json`. Future `.als` saves use that mapping so they create a new
version instead of duplicating the project.

Running import again is safe: folders that are already linked are skipped.

Changed saves use content-addressed incremental sync: Tunesfork hashes project
files, reuses a local hash cache in macOS Application Support, negotiates which
immutable blobs are missing, and uploads only those files plus a manifest.
Legacy full-ZIP versions remain downloadable. If the incremental endpoint has
not yet been deployed, the client explicitly falls back to a full ZIP snapshot.

If macOS later revokes folder access, the tray UI shows a recovery card. The
user can choose the folder again or jump directly to Files & Folders settings;
the app does not silently fall back to uploading/opening a duplicate project.

## Backend configuration

The packaged app currently defaults to the deployed Supabase Functions endpoint.
For staging or migration builds, override these values at launch/build time:

```bash
TUNESFORK_URL=https://www.tunesfork.com
TUNESFORK_FUNCTIONS_URL=https://<project-ref>.supabase.co/functions/v1
TUNESFORK_STATE_DIR=/tmp/tunesfork-sync-staging-state
```

Do not switch production defaults until the owned backend has passed the
acceptance checklist in `docs/OWNED_BACKEND_MIGRATION.md`.

## Release smoke test

With an already paired local profile:

```bash
npm run smoke:backend
```

This checks the latest GitHub installer URL, pairing initialization, paired
device authentication, and a signed project ZIP download. It does not upload a
new version.
