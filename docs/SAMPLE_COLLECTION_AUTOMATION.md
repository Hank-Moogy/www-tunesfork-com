# Sample Collection Automation

## Current Behavior

Tunesfork Sync uploads the detected Ableton Project folder. It does not currently collect samples that live outside that folder.

The desktop app does parse the `.als` file and stores a `sample_check` object on each version:

- `included`: referenced samples found inside the project folder
- `missing`: relative sample references not found in the project folder
- `external`: sample references that point outside the project folder

This lets the UI warn that collaborators may see offline samples.

## What Ableton Collect All And Save Does

Ableton's native **File -> Collect All and Save** command copies external media into the Project folder, typically under `Samples/Collected`, and updates/saves the Live Set so those references are portable.

Ableton's docs explicitly recommend this when transferring a Set to another computer or user. Plug-ins are not copied and still need to be installed separately.

## Automation Options

### Option 1: Guide The User To Ableton's Native Flow

Show clear warnings and tell the producer to run:

```text
File -> Collect All and Save
```

Then Tunesfork Sync uploads the next save.

This is the safest launch path because Ableton owns the copy and reference-update behavior.

### Option 2: Launch Ableton And Open The Project

Tunesfork can open the `.als` file and show instructions, but still rely on the user to click through Collect All and Save.

This is feasible and low-risk. It reduces friction without pretending to own Ableton's internals.

### Option 3: macOS UI Automation

Tunesfork could use AppleScript / Accessibility automation to drive Ableton menus:

1. Open the `.als`.
2. Select File -> Collect All and Save.
3. Confirm the dialog options.
4. Wait for the save to finish.

Risks:

- Requires macOS Accessibility permission.
- Ableton menu/dialog text can vary by version/language.
- Automation can break if Ableton is busy, has modal dialogs open, or the project is unsaved.
- Hard to guarantee completion before upload.

This should not be a launch dependency.

### Option 4: Copy External Files And Rewrite `.als`

Tunesfork could parse the gzip-compressed XML `.als`, copy external samples into `Samples/Collected`, rewrite `SampleRef` paths, then re-gzip the set.

Risks:

- `.als` is not a public stable API.
- Audio references include relative path, absolute path, file size, CRC, and other metadata.
- Mistakes can corrupt or subtly change a Live Set.
- Pack/Core Library references and Max for Live devices complicate behavior.

This is technically possible as an R&D project, but too risky for the September launch.

## Recommendation

For launch:

1. Keep uploading the Project folder only.
2. Make sample warnings clear in the tray app, upload flow, project page, and share page.
3. Add an "Open in Ableton to collect samples" helper later.
4. Consider UI automation only after testing across Ableton 11/12, Apple Silicon/Intel, and common modal states.

Do not attempt `.als` rewriting before launch.
