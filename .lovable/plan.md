## Goal

Today the **web** upload modal already runs a missing-samples check (good). The **desktop** app — which is now the main save path — parses the `.als` but doesn't verify that referenced samples actually exist inside the zipped project folder. Collaborators only discover the problem when Ableton throws "Media files are missing" days later.

Bring desktop saves up to the same level, **persist** the result on the version, and **surface** it in the web UI so missing samples become visible at a glance.

---

## What we'll build

### 1. Desktop: validate samples before upload

In the desktop sync flow, after parsing the `.als` and locating the project folder, walk the folder and check each `SampleRef`:

- `relativePath` present and resolves inside the folder → **included**
- `relativePath` missing in folder → **missing**
- Only `absolutePath`, no usable relative path → **external** (lives outside the project folder, won't be in the zip)

Produce `{ included, missing, external }` counts + the first 10 offending paths.

The save still uploads (we don't block the user mid-session), but the desktop tray logs and notifies:

> "Uploaded *OddOde v2* — 3 samples missing, collaborators may see 'Media files missing'. Run *Collect All and Save* in Ableton."

### 2. Persist the check on each version

Add a `sample_check jsonb` column to `project_versions` storing:

```json
{ "included": 142, "missing": 3, "external": 1,
  "missing_paths": ["Samples/loop1.wav", "..."],
  "external_paths": ["/Users/foo/Library/.../kick.wav"] }
```

Both upload paths populate it:
- Desktop edge function (`create-version-from-desktop`) accepts `sample_check` from the body.
- Web `UploadModal` writes it from the existing `validateFolder` result.

### 3. Surface it in the project page

On every save row in the versions panel:

- All good → small green check: "Samples ✓"
- Issues → amber warning chip: "3 missing samples", click opens a popover listing them with a "How to fix" hint pointing to *File → Collect All and Save*.

The selected version's metadata strip (next to BPM / Ableton version / file size) gets the same chip in larger form.

### 4. Web upload modal polish

Currently silent on success. Add a green "All N samples included" confirmation so the user sees the check passed.

---

## Out of scope (other ideas from the Ableton doc, save for later)

- Cloud-folder warning when a user picks an iCloud/Dropbox watch folder
- Filename hygiene (leading-space, illegal chars)
- Backup-status badge on dashboard cards
- Landing-page section quoting the Ableton article

---

## Technical notes

**Schema**

```sql
ALTER TABLE public.project_versions
  ADD COLUMN sample_check jsonb;
```

No RLS change needed (existing `project_versions` policies cover it).

**Desktop**

- New `electron/src/sampleCheck.cjs` — given `(projectFolder, samples)` returns the counts + offending paths. Reuses the same normalization rules as `src/lib/als-parser.ts:validateFolder` so web/desktop verdicts match.
- `electron/main.cjs` (or `electron/src/sync.ts`) calls it after `parseAlsFile` and before `createVersion`, then passes `sample_check` in the API body.
- `electron/src/api.ts:CreateVersionInput` gains `sample_check?: unknown`.

**Edge function**

- `supabase/functions/create-version-from-desktop/index.ts` writes `sample_check: body.sample_check ?? null` into the insert.

**Web**

- `src/components/UploadModal.tsx` — derive `sample_check` from the existing `validateFolder` result (`missingSamples.length`, `nonRelativeSamples.length`, `samples.length`) and include it in the insert. Add a green confirmation row when both arrays are empty.
- `src/pages/ProjectPage.tsx` — render the new chip on each version row in the versions panel and in the selected-version meta strip. New tiny `SampleCheckBadge` component for reuse.

**Backfill**

Existing rows leave `sample_check` NULL; UI treats NULL as "unknown" (no chip, no false reassurance).

---

## Acceptance

- A desktop save with 2 missing samples shows an amber chip on that version in the web UI within seconds, lists the two paths in the popover, and the desktop tray logs the warning.
- A clean save shows a green "Samples ✓" chip.
- Old versions without a check show no chip.
- Web upload of a folder still produces the same verdict as the desktop run for the same project.
