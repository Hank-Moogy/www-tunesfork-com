# Tunesfork Sync — Desktop App

Menu-bar Electron app that watches your Ableton project folders and uploads
new versions to Tunesfork on every save.

## Develop locally

```bash
cd electron
npm install
npm run dev:all   # runs vite for the tray UI + electron in parallel
```

## Build distributable installers

We ship via **GitHub Releases** with **unsigned** alpha builds.
Code-signing (Apple Developer ID + Windows EV cert) is on the roadmap.

### macOS (run on a Mac)

```bash
npm run dist:mac
# → release/Tunesfork-Sync-mac-universal.dmg
```

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
