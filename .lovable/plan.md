## Plan

1. **Make runtime dependencies deterministic**
   - Update the Electron package config so the packaged app explicitly includes production dependencies needed by the sync engine.
   - Keep dev-only build tooling out of runtime where possible.

2. **Add a packaging verification step**
   - Add a script that inspects the built macOS app after `electron-builder` runs and confirms `chokidar`, `archiver`, and related runtime modules are present in the packaged app.
   - Wire it into the mac build command so a bad DMG fails locally instead of reaching testers.

3. **Bump the desktop version**
   - Move the Electron package and website download label to the next alpha version so testers can clearly verify they installed the fixed build.

4. **Give you exact rebuild/release steps**
   - After implementation, you’ll rebuild the DMG, upload it to a new GitHub release, then re-download and test Resume again.

## Technical details

The app is still showing the old `Missing deps. Run npm install in /electron` message, which means the DMG you installed was built from code/config that did not include the runtime `node_modules` required by `main.cjs` when Resume starts the sync watcher. The fix should make the packaged app self-contained and fail packaging if those modules are missing.