## Storage usage section on profile

Add a new `StorageCard` component on `/profile`, placed right under `HeroStats`.

### What the user sees

- **Header**: "Storage" with the total used (e.g. `2.4 GB across 12 projects`) and a small note "No storage limit during alpha".
- **Usage bar**: a single full-width bar split into colored segments — one segment per top project, plus a grey "Other" segment. Hovering a segment shows the project name + size.
- **Breakdown list**: top 8 projects by size, each row showing
  - Project name (links to `/project/:id`)
  - Mini bar (% of total)
  - Size (e.g. `412 MB`) and version count (e.g. `8 versions`)
- "Show all" expands to the full list if there are more than 8.

### Data

Extend the existing `get_user_stats` Postgres function to also return:

```
storage_by_project: [
  { project_id, project_name, bytes, version_count },
  ...
] -- ordered by bytes desc, all projects user has uploaded versions to
```

Computed by summing `file_size_bytes` from `project_versions` grouped by `project_id` where `uploader_id = target_user`, joined to `projects.name`. Reuses existing RLS-safe SECURITY DEFINER pattern.

### Files

- **Migration**: replace `get_user_stats` to add `storage_by_project` field.
- **New**: `src/components/profile/StorageCard.tsx` — bar + list UI using existing `glass-card` styling and pastel tints already used in `HeroStats`.
- **Edit**: `src/pages/ProfilePage.tsx` — add `storage_by_project` to `UserStats` type, render `<StorageCard stats={stats} />` after `<HeroStats />`.

### Notes

- No quota logic now; the component is structured so we can drop in a quota bar later by passing an optional `limitBytes` prop.
- Reuses the existing `formatBytes` helper (move it to `src/lib/utils.ts` so both `HeroStats` and `StorageCard` import it).
