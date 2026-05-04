## Why the samples are offline

Ableton stores sample references in the `.als` in two ways:

1. **Relative** — `Samples/Imported/kick.wav` → resolved relative to the `.als` file. These survive zipping, sharing, and unzipping as long as the folder structure around the `.als` is preserved.
2. **Absolute** — `/Users/joe/Music/Splice/kick.wav` → only resolves on the original machine. These are what create "Samples Offline" on the recipient's side.

"Collect All and Save" is supposed to copy every external sample into the project's `Samples/Imported/` folder and rewrite all references to relative — **but only for the categories the user ticks in the dialog**. By default Live does **not** collect:

- Files from Factory Packs / Live Packs
- Files already inside the project (fine)
- Files from User Library (depending on options)
- Files in "other locations" if the box isn't checked

If the uploader hit "Collect All and Save" without ticking every "Other locations / Factory / User Library" checkbox, the `.als` still contains absolute paths → the recipient sees "Samples Offline" even though the zip looks correct.

A second, simpler cause we currently allow:

- The uploader dragged the **single `.als` file** (not the folder) into our modal. We show a warning but still let them proceed, producing a zip with no `Samples/` folder at all.
- The uploader picked a folder that doesn't actually contain `Samples/` and clicked "Continue anyway".

Our current `validateFolder` only checks "is there a folder named samples somewhere?" — it never inspects what the `.als` actually references, so a half-collected project passes silently.

## The fix

Catch both cases at upload time, before the zip ships, so the recipient never gets a broken project.

### 1. Parse sample references from the `.als`

Extend `src/lib/als-parser.ts` to also walk every `<SampleRef>` node and pull the file's path:

- Modern `.als` (Live 10+): `<SampleRef><FileRef><RelativePath>…<RelativePathElement Dir="Samples"/>…</RelativePath><Path Value="/Users/…"/><HasRelativePath Value="true|false"/><RelativePathType Value="…"/></FileRef></SampleRef>`
- Older versions only have `<Path Value="…"/>` with no `<RelativePath>`.

Return a new `samples: { name; relativePath?: string; absolutePath?: string; isRelative: boolean }[]` array on `AlsMetadata`.

### 2. Strengthen `validateFolder`

Take the parsed `samples[]` plus the actual `File[]` and compute:

- `missingSamples`: any sample whose resolved relative path isn't present in the uploaded files
- `nonRelativeSamples`: any sample whose `.als` entry is absolute / `HasRelativePath=false`

Return them alongside `errors` / `warnings`.

### 3. Update `UploadModal` to block, not just warn

In `src/components/UploadModal.tsx`:

- If `nonRelativeSamples.length > 0` → hard error: "Your `.als` still references samples outside the project folder. In Ableton: **File → Collect All and Save**, tick **every** category (Factory Packs, User Library, Other locations), save, then re-upload." Show the first few offending paths so they understand. Do not allow "Continue anyway".
- If `missingSamples.length > 0` → hard error: "Some samples referenced by the set aren't in the folder you selected: …". Same guidance.
- Single-`.als` upload (`handleAlsSelect`) → keep allowed but make the warning much louder ("Samples will be missing — your collaborator won't be able to play the project") and require an explicit "I understand" checkbox before Next is enabled.
- "Continue anyway" only stays available for benign warnings (e.g. large project size), not for missing-samples warnings.

### 4. Diagnose the existing share

Once in build mode I'll look at the actual uploaded zip for the project behind `/share/8e57edf574bc4d3a81edfb9378d67450` to confirm which of the two causes hit you (no `Samples/` folder vs. absolute paths in the `.als`), and report back. No code change to the existing version — re-uploading after the fix lands is the cleanest path.

## Files to touch

- `src/lib/als-parser.ts` — add `<SampleRef>` parsing, return `samples[]`, extend `FolderValidation` with `missingSamples` / `nonRelativeSamples`.
- `src/components/UploadModal.tsx` — surface the new errors, gate the "Continue anyway" / single-`.als` paths, add the explicit acknowledgement.
- `electron/als-parser.cjs` — mirror the new sample-ref extraction so desktop saves get the same protection (otherwise the Electron sync would happily upload broken projects too).

## What this won't fix

This catches bad projects on the way in. It doesn't repair already-uploaded versions — the only way to recover the current shared project is for the uploader to re-collect properly and upload a new version.
