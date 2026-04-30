
# Tunesfork Sync — Auto-upload Ableton projects on save

A small desktop app that lives in the menu bar (Mac) / system tray (Windows). The user points it at a folder containing Ableton projects, and every time they save in Ableton, the corresponding Project folder is zipped and uploaded as a new version to Tunesfork.

## How it will feel for the user

1. Download **Tunesfork Sync** from a new "Desktop App" page in the Tunesfork web app
2. Install, open it — menu-bar icon appears
3. Click "Sign in" → browser opens Tunesfork → confirms → app gets a token
4. Click "Add folder to watch" → pick `~/Music/Ableton/User Library/Projects` (or any parent folder)
5. App scans for `.als` files and lists each Project folder it found
6. For each Project folder, user picks: **link to existing Tunesfork project** or **create new**
7. Done. From now on:
   - Save in Ableton → menu-bar icon spins → "Uploading v4 of *MyTrack*…" toast → ✅
   - Click the icon to see recent syncs, pause sync, or open the project on tunesfork.com

## Why a desktop app (recap)

A web app cannot watch the local filesystem in the background. Browser folder-watch (File System Access API) only works while a Chrome tab is open and focused — which producers won't do. Desktop is the only path to "every Ableton save just works."

## Architecture

```text
┌─────────────────────────────────────────┐
│  Ableton Live (user saves a set)        │
│         writes MyTrack.als              │
└──────────────────┬──────────────────────┘
                   │ fs change event
                   ▼
┌─────────────────────────────────────────┐
│  Tunesfork Sync (Electron, background)  │
│  - chokidar watches *.als files         │
│  - debounce 5s (Ableton writes twice)   │
│  - zip the Project folder (skip Backup/)│
│  - resolve which Tunesfork project      │
│  - upload via TUS resumable             │
│  - call edge function to create version │
└──────────────────┬──────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────┐
│  Tunesfork backend (existing)           │
│  - project-zips storage bucket          │
│  - project_versions row                 │
│  - same data the web upload writes      │
└─────────────────────────────────────────┘
```

The desktop app talks to the same Supabase-managed backend the web app uses. No new database, no schema migrations beyond one small additions described below.

## What gets built — three workstreams

### A. Web app changes (small, ~1 day)

1. **New page `/desktop-app`** — download links for Mac (Apple Silicon, Intel) and Windows, install instructions, "What is Tunesfork Sync" copy
2. **New Settings tab "Desktop sync"** — shows linked devices, lets user revoke a device's token
3. **New nav item "Get the desktop app"** — pill in the navbar with a "New" badge
4. **OAuth-style device-pairing flow:**
   - Desktop app opens `https://tunesfork.com/desktop-pair?code=ABC123`
   - User confirms in the browser ("Pair Tunesfork Sync on MacBook Pro?")
   - On confirm, the page calls a new edge function `pair-device` that exchanges the short code for a long-lived API token, displays "Return to the app — you're paired"
   - Desktop app polls a `device-token-exchange` endpoint with the code, gets the token, stores it in OS keychain
5. **One small DB addition: `device_tokens` table** (`id`, `user_id`, `name`, `token_hash`, `last_used_at`, `created_at`, `revoked_at`) + RLS so users only see/revoke their own
6. **One new edge function: `create-version-from-desktop`** — accepts a token (Bearer), validates against `device_tokens`, takes `{project_id, zip_storage_path, change_note, metadata}`, writes a `project_versions` row exactly like the web flow does today

### B. Desktop app (Electron, the bulk of the work)

**Stack:** Electron + React (reuse Tunesfork's design tokens for menu) + TypeScript. Use `@electron/packager` for builds.

**Key modules:**
- `main.cjs` — menu-bar/tray, lifecycle, single-instance lock, deep-link handler for `tunesfork://` URLs (used during pairing)
- `watcher.ts` — `chokidar` watching configured folders, filters to `*.als`, ignores `**/Backup/**` and `**/Samples/Processed/Crop/**`
- `debouncer.ts` — when an `.als` change fires, wait 5 seconds of quiet (Ableton actually writes the file 2-3 times per save)
- `zipper.ts` — given the `.als` path, walk up to find the **Project folder** (the folder containing `Ableton Project Info/`), zip the whole folder excluding `Backup/`. Use streaming zip (`archiver`) to avoid loading 2GB projects into memory
- `uploader.ts` — TUS resumable upload (same `tus-js-client` lib the web uses) to the same `project-zips` bucket. Gets a short-lived storage token from the new `create-version-from-desktop` edge function so we never embed Supabase keys
- `linker.ts` — for each detected Project folder, store a mapping `{local_path → tunesfork_project_id}` in a local SQLite/JSON file. First time a Project is seen, prompt the user to pick "Link to existing project" (dropdown of their projects) or "Create new"
- `tray-ui.tsx` — menu showing watched folders, recent uploads (last 10), pause/resume toggle, "Open Tunesfork" link, sign out

**Auth storage:** OS keychain via `keytar` (Mac Keychain, Windows Credential Manager). Never plain-text on disk.

**Crash safety:** if a save event fires and the upload is interrupted (network drop, app crash), TUS resumes on next launch. Mark each Project folder with a `last_uploaded_hash` so we don't re-upload identical state.

### C. Distribution & code-signing (the painful part)

- **Mac:** need an Apple Developer account ($99/yr), code-sign with `electron-osx-sign`, notarize with `notarytool`. Without this, users get scary "unidentified developer" warning on first open. Ship `.dmg` and `.zip` for Mac (Apple Silicon + Intel)
- **Windows:** need an EV code-signing cert (~$300/yr from Sectigo/Digicert) to avoid SmartScreen warnings. Ship `.exe` installer (NSIS via `electron-builder` once we move off the sandbox) or `.zip` portable
- **Auto-update:** integrate `electron-updater` pointing at a hosted update feed (can be a static JSON in Supabase Storage describing the latest version + download URLs)
- **Initial release:** ship without auto-update if needed; user manually downloads new versions from `/desktop-app` page. Add auto-update in v1.1

## What we will NOT do in v1 (explicit non-goals)

- ❌ **Smart sample diffing.** v1 always re-zips the whole Project folder. A 500MB project re-uploads 500MB on every save. Acceptable because most projects are <100MB and TUS is fast on resume. Sample-level diffing is a v2 optimization (per-file content hashing, only re-upload changed files, server reassembles)
- ❌ **Watching outside a configured root folder.** User must point the app at one or more folders; no full-disk scan
- ❌ **Real-time collaboration.** This is async backup/versioning, not Google-Docs-style live sync
- ❌ **Tauri.** I considered Tauri (smaller binaries, Rust) but Electron has a much bigger ecosystem for the modules we need (`chokidar`, `archiver`, `keytar`, `tus-js-client`, `electron-updater`) and you already have it scaffolded-friendly in Lovable
- ❌ **Linux build.** Defer until requested. Producers are >95% Mac/Windows
- ❌ **Per-folder upload settings** (e.g. "always confirm before upload"). v1 = silent auto-upload. Adds toggle in v1.1 if needed

## Suggested rollout order

To avoid spending weeks before validating, I recommend three shippable milestones:

| Milestone | What ships | Validates |
|---|---|---|
| **M1 — Web side only (~1-2 days)** | `/desktop-app` page (still showing "coming soon"), `device_tokens` table, pairing flow, `create-version-from-desktop` edge function. Test end-to-end with `curl` from your terminal pretending to be the desktop app | Backend is ready, you can `curl` an upload through and see a new version appear |
| **M2 — Desktop app MVP (~1-2 weeks)** | Unsigned Mac + Windows builds. Sign-in, watch one folder, link projects manually, upload on save, basic tray UI. Distribute manually to 3-5 test users (you said all are reachable). Skip code-signing initially — testers click through "open anyway" | Real producers actually find this useful; reveals edge cases (project folder structure variants, save-while-uploading, huge projects) |
| **M3 — Polish & ship (~1 week + ongoing signing setup)** | Code-signing & notarization, auto-update, pause/resume, multi-folder, settings UI in web app | Public release |

Total: roughly **3-4 weeks of focused work** for a shippable v1, plus ~$400/yr in signing certs.

## Technical details (for the technical record)

- **Project folder detection:** Ableton creates `Project folder/` containing `Ableton Project Info/` subfolder + the `.als` + `Samples/`. Walking up from any `.als` until we find a sibling `Ableton Project Info/` directory identifies the project root
- **Save signal:** Ableton on save writes to a temp file then renames. Watching for `change` events on `*.als` with a 5-second debounce captures this reliably without firing during the brief temp state
- **Skip list when zipping:** `Backup/` (Ableton's auto-saves, can be hundreds of MB), `*.als~` (lock files), `.DS_Store`, `Thumbs.db`
- **Idempotency:** hash the zip after creation; if hash equals the last uploaded hash for this project, skip the upload (covers cases where Ableton saved but nothing actually changed)
- **Reuse from web app:** the existing `parseAlsFile` logic in `src/lib/als-parser.ts` (extracts BPM, plugin list, track list) should be ported to the desktop app — same metadata flows into `project_versions.plugin_list` and `track_list`
- **Auth model:** desktop tokens are scoped to one user, never expire (until user revokes), but each upload still goes through an edge function that validates the token + enforces RLS-equivalent checks (user owns the target project or has contributor permission). No Supabase service-role key ever ships in the binary

## Cost & risk summary

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/yr | Required for Mac signing |
| Windows EV code-signing cert | ~$300/yr | Required to avoid SmartScreen |
| Storage cost from larger upload volume | Variable | Auto-upload = more uploads. Smart-diff in v2 mitigates |
| Ongoing support burden | Real | Desktop apps generate "doesn't work on my Mac" tickets that web apps don't |

## Open questions before I start building

1. **Are you OK starting with M1 only this week?** I'd rather ship the backend and pair flow first, then we both have a working "fake desktop client" via curl to validate the data model, before committing to the Electron build
2. **Naming: "Tunesfork Sync" OK, or something else?** ("Tunesfork Desktop", "Tunesfork Studio", etc.)
3. **Code-signing certs — buy now or after M2?** I'd defer until after we've validated with a few unsigned-test-builds with your test users
