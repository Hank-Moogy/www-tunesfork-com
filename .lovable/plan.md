## The bug

The user's screenshot shows the desktop app logging:

```
Missing deps. Run `npm install` in /electron
```

That message comes from `electron/main.cjs` (around line 173–178), where the sync engine lazy-requires `chokidar` and `archiver`:

```js
try {
  chokidar = require("chokidar");
  archiver = require("archiver");
} catch (e) {
  log("err", "Missing deps. Run `npm install` in /electron");
  return;
}
```

Inside the packaged `.app`, those modules are not present — so `require()` throws and sync never starts. Pairing works (it uses only built-in `https`), which matches the screenshot: "Paired as MacIntel" succeeds, but as soon as Resume is clicked, deps fail.

## Root cause

In `electron/package.json`, the electron-builder `files` array is:

```json
"files": [
  "main.cjs",
  "preload.cjs",
  "als-parser.cjs",
  "dist/**",
  "src/**",
  "package.json"
]
```

`node_modules/**` is not listed. electron-builder normally auto-includes production dependencies, but when a custom `files` array is provided without an explicit `node_modules` pattern, packaged builds frequently end up missing them — especially when `npm install` was run with dev/optional flags or when the DMG was built from a fresh clone where the dep tree wasn't fully resolved before `electron-builder` ran.

The result: the shipped `.app/Contents/Resources/app.asar` doesn't contain `chokidar` or `archiver`, so end users hit this error even though it works in `npm run dev`.

## Fix

### 1. Bundle production node_modules into the build

Update `electron/package.json` `build.files` to explicitly include node_modules:

```json
"files": [
  "main.cjs",
  "preload.cjs",
  "als-parser.cjs",
  "dist/**",
  "src/**",
  "package.json",
  "node_modules/**/*"
]
```

And add `asarUnpack` for `chokidar` (it uses `fsevents` on macOS, which is a native module that must live outside the asar):

```json
"asarUnpack": [
  "node_modules/fsevents/**/*",
  "node_modules/chokidar/**/*"
]
```

### 2. Improve the in-app error so we can debug future cases

Replace the generic "Missing deps" log with the actual `e.message` from the failed require, so if this ever happens again the activity log shows *which* module failed and *where* it looked. Keep the user-facing wording friendly:

```js
} catch (e) {
  log("err", `Sync engine failed to load: ${e.message}`);
  log("err", "This is a packaging bug — please reinstall the latest build.");
  return;
}
```

### 3. Bump alpha version

Update `electron/package.json` version to `0.1.0-alpha.3` and the matching label in `src/lib/desktopDownload.ts` (`DESKTOP_APP_VERSION_LABEL`) so the user knows to grab the new build, and so old broken DMGs are visibly outdated.

## What you (Hank) need to do after I apply the fix

1. `cd electron && rm -rf node_modules dist release && npm install`
2. `npm run dist:mac` (and `npm run dist:win` if shipping Windows too)
3. Attach the new `Tunesfork-Sync-mac-universal.dmg` (and `.exe`) to a new GitHub release — the site auto-fetches `latest`.
4. Tell the affected user (the one in the screenshot) to redownload and reinstall.

## What this does NOT change

- No frontend / dashboard / database changes.
- No edge function changes.
- The pairing flow, watcher logic, and upload pipeline are untouched — only the packaging manifest and one error message.

## Files touched

- `electron/package.json` — `build.files`, `build.asarUnpack`, `version`
- `electron/main.cjs` — improve the catch block message
- `src/lib/desktopDownload.ts` — bump `DESKTOP_APP_VERSION` and `DESKTOP_APP_VERSION_LABEL`
