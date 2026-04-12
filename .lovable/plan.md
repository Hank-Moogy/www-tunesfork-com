

## Build the Project Page

### Overview
Create a full project detail page at `/project/:id` that the user lands on after upload (already navigating there). Inspired by Splice Studio's layout: version timeline on the left, main content area on the right showing the selected version's details, comments, and actions.

### Layout (Splice-inspired, dark theme)

```text
┌─────────────────────────────────────────────────────┐
│ Navbar                                              │
├────────────┬────────────────────────────────────────┤
│ VERSION    │  Version 1                    [⬇ Download] │
│ TIMELINE   │  89 BPM · 5 plugins · 1.3 GB          │
│            │                                        │
│ V1  ●      │  ┌─ Audio Preview (if available) ─┐    │
│ "First..." │  │  ▶ Play / waveform             │    │
│ Apr 12     │  └────────────────────────────────┘    │
│            │                                        │
│            │  ┌─ Track List (future) ──────────┐    │
│            │  │  Arrangement timeline view     │    │
│            │  └────────────────────────────────┘    │
│            │                                        │
│            │  PLUGINS: Waves Tune, API-2500, ...    │
│            │                                        │
│            │  VERSION DESCRIPTION                   │
│            │  "First upload by Hugo"                │
│            │                                        │
│ [+ Upload  │  COMMENTS (0)                          │
│  New Ver.] │  [Add a comment...]                    │
│            │                                        │
├────────────┤  COLLABORATORS          [+ Add]        │
│ Settings ⚙│  [Share link 🔗]                       │
└────────────┴────────────────────────────────────────┘
```

### Steps

**1. Add `track_list` column to `project_versions`**
- Migration: `ALTER TABLE project_versions ADD COLUMN track_list jsonb DEFAULT null;`
- For future track/clip visualization (won't block the page build).

**2. Extend ALS parser with track extraction (`src/lib/als-parser.ts`)**
- Add `Track` and `Clip` interfaces to `AlsMetadata`.
- Parse `<AudioTrack>`, `<MidiTrack>`, `<ReturnTrack>`, `<GroupTrack>` with `<EffectiveName>` and nested clips (`<CurrentStart>`, `<CurrentEnd>`).
- Save to `track_list` during upload.

**3. Update `UploadModal.tsx`**
- Include `metadata.tracks` in the `project_versions` insert as `track_list`.

**4. Create `src/pages/ProjectPage.tsx`**
The main page with these sections:

- **Header**: Project name, BPM badge, plugin count badge, settings gear icon.
- **Left sidebar — Version Timeline**: List of all versions (newest first), each showing version number, uploader name, date, change note. Click to select. Button to upload a new version (opens UploadModal in "new version" mode).
- **Right main area — Selected Version**:
  - Audio preview player (if `audio_preview_url` exists).
  - Track arrangement timeline (from `track_list` JSONB — colored clip blocks on a horizontal beat axis, grouped by track).
  - Plugin list (from `plugin_list`).
  - Version description (`change_note`).
  - Comments section — fetch from `comments` table, post new comments. Each comment shows user avatar, name, timestamp.
  - Download button — generates a signed URL from `project-zips` bucket.
  - Share link button — copies the current URL to clipboard.
  - Collaborators section — shows current collaborators, "Add collaborator" dialog (email input, permission level select, inserts into `collaborators` table).

**5. Create `src/components/ArrangementTimeline.tsx`**
- Takes `track_list` JSONB data, renders a horizontal scrollable timeline.
- Each track row: type icon + name on left, colored clip blocks positioned proportionally.
- Beat markers along the top axis.
- Ableton color palette mapping (index → hex).

**6. Add route in `App.tsx`**
- `/project/:id` → `ProjectPage` wrapped in `ProtectedRoute`.

**7. Support "Upload New Version" flow**
- Pass optional `existingProjectId` prop to `UploadModal`.
- When set, skip project creation, just insert a new `project_version` with incremented `version_number`.

### Files modified
- `src/lib/als-parser.ts` — Add track/clip extraction
- `src/components/UploadModal.tsx` — Pass `track_list`, support new version mode
- `src/pages/ProjectPage.tsx` — New file (main page)
- `src/components/ArrangementTimeline.tsx` — New file (track visualization)
- `src/App.tsx` — Add `/project/:id` route
- Database migration — Add `track_list` column

### Database changes
One migration adding `track_list jsonb DEFAULT null` to `project_versions`. No new RLS policies needed — existing policies already cover read/write access.

