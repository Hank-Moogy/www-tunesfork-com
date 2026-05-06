## Problem

The desktop app crashes on launch with:

```
SyntaxError: Unexpected token '}'
  at main.cjs:476
```

In `electron/main.cjs`, the opening `app.whenReady().then(() => {` was lost in a prior edit. The tray-icon / window setup code at lines 434–475 now sits at the top level, and the dangling `});` on line 476 has no matching opener — so Node refuses to parse the file and Electron exits before it can even create a window.

## Fix

In `electron/main.cjs`, wrap the tray bootstrap block in `app.whenReady().then(...)` again:

- Replace the blank lines 432–433 with:
  ```js
  app.whenReady().then(() => {
  ```
- Leave lines 434–475 (icon resolution, `new Tray(...)`, click handlers, `createTrayWindow()`, auto-resume sync) unchanged.
- Line 476's existing `});` then correctly closes the `whenReady` callback.

No other files need to change. After the edit, the alpha .dmg needs to be rebuilt and re-uploaded to the GitHub release so users get a working binary — the published web download URL stays the same.

## Note on shipping the fix

Lovable can only edit the source. To actually unblock Mac users you (or whoever owns the repo) will need to:
1. `cd electron && npm run dist:mac`
2. Upload the new `Tunesfork-Sync-mac-universal.dmg` to the GitHub release.

The download page on tunesfork.com points at `/releases/latest/download/...`, so no web change is required once the new asset is uploaded.