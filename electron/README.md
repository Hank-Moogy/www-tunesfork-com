# Tunesfork Sync — Desktop App (M2)

This folder is the scaffold for the **Tunesfork Sync** Electron desktop app.
It is **not** built by the Lovable web preview. To work on it you'll clone
the project locally and run the commands below.

## What's here

```
electron/
├── README.md              ← you are here
├── main.cjs               ← main process: tray icon, lifecycle, deep links
├── preload.cjs            ← exposes a safe API to the tray UI
├── package.json           ← electron-only deps (chokidar, archiver, keytar, tus-js-client)
└── src/
    ├── api.ts             ← talks to Tunesfork edge functions
    ├── auth.ts            ← OS keychain (keytar) + pair flow
    ├── watcher.ts         ← chokidar — watches *.als files
    ├── debouncer.ts       ← collapses Ableton's 2-3 writes per save into one event
    ├── projectFolder.ts   ← walks up from .als to find the Project folder
    ├── zipper.ts          ← streaming zip of Project folder (skips Backup/)
    ├── uploader.ts        ← TUS resumable upload to project-zips bucket
    ├── linker.ts          ← maps local Project folder → Tunesfork project_id
    ├── store.ts           ← persistent JSON store (~/Library/Application Support/Tunesfork)
    └── tray-ui/           ← React UI rendered in the tray window
```

## Running locally (once you've cloned to your machine)

```bash
cd electron
npm install
npm run dev      # opens the menu-bar app pointed at staging
```

## Building distributable binaries

```bash
npm run build:mac        # Apple Silicon + Intel .dmg + .zip (unsigned in M2)
npm run build:win        # Windows .exe + .zip
```

Code-signing config is wired up but disabled until M3 (we'll add Apple Developer
ID + Windows EV cert at that point).

## Backend it talks to (already shipped in M1)

| Edge function | Purpose |
|---|---|
| `pair-device-init` | Get a 6-char pairing code + browser URL |
| `pair-device-confirm` | (browser-side) confirm the code |
| `pair-device-poll` | (desktop-side) poll until confirmed, receive token |
| `create-version-from-desktop` | Authenticated upload registration |

Plus storage bucket `project-zips` (same one the web app uses) and
DB tables `device_tokens`, `device_pair_codes`.
