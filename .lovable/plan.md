## What's happening

The new build *does* include `archiver` itself, but `archiver`'s nested dependency `archiver-utils` is missing from `app.asar`. That's why `verify-pack` passed (it only checks top-level packages) but Resume still crashes.

Root cause: `electron/package.json` overrides electron-builder's default `files` glob with `"node_modules/**/*"`. That string looks correct but it disables electron-builder's smart production-dependency tracer, and combined with how `npm install` hoists transitive deps, some nested packages (`archiver-utils`, possibly `zip-stream`'s deps) get pruned out of the asar.

## Plan

### 1. Let electron-builder handle node_modules itself
In `electron/package.json` `build.files`, remove the explicit `"node_modules/**/*"` line. electron-builder will then auto-include every production dependency (and its transitive tree) by walking `package.json`, which is the supported path and correctly picks up `archiver-utils`, `zip-stream`, etc.

### 2. Make verify-pack catch transitive misses
Update `electron/scripts/verify-pack.cjs` so the REQUIRED list also includes the transitive deps that have already bitten us:
- `archiver-utils`
- `zip-stream`
- `compress-commons`
- `readable-stream`

If any of these are absent from `app.asar`, the build fails before the DMG is produced.

### 3. Bump version
- `electron/package.json` → `0.1.0-alpha.5`
- `src/lib/desktopDownload.ts` label → `v0.1.0 alpha.5`

### 4. Rebuild + release instructions (after approval and code changes)
```
cd electron
rm -rf node_modules dist release
npm install
npm run dist:mac
```
- Expected verify-pack output now lists `ok: archiver-utils`, `ok: zip-stream`, etc.
- If green: publish GitHub release `v0.1.0-alpha.5` with the new DMG, click Publish → Update in Lovable, re-test Resume in incognito download.
- If red: paste the `MISSING:` lines back and we'll pin the offending packages explicitly in `dependencies`.

## Why not just pin archiver-utils in dependencies?
That would mask the underlying packaging bug and we'd hit the same class of error the next time `archiver` (or any other dep) gains a new transitive. Removing the `files` override is the proper fix; the expanded verify-pack list is the safety net.
