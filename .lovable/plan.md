

## Updates to plan

**1. Keep existing accent color for "Upload Project" button** — no color change. Will continue to use current `bg-accent` (electric green) variant on the primary CTA in Dashboard, "+ New Project" tile, and empty-state CTA. Glass/VisionOS restyle still applies to surfaces, but CTA color is preserved.

**2. Backend search instead of client-side filter**

Move project search to Supabase queries so it scales beyond what's loaded.

- Add a debounced (250ms) search input. On change, refetch:
  - **My Projects**: `supabase.from('projects').select(...).eq('owner_id', user.id).ilike('name', '%query%')`
  - **Shared with me**: same `ilike` filter applied to the second query (`.in('id', sharedIds).ilike('name', '%query%')`)
- Empty query → no `ilike`, just normal list.
- Pagination: switch to `.range(from, to)` with `pageSize = 12`. "Show more" appends next page (uses `count: 'exact'` head request to know if more exist).
- Active tab determines which query runs (don't fetch both on every keystroke).
- Loading skeleton during search.
- Archived toggle stays a query param (`.eq('archived', false)` unless toggled).

### Files touched (delta only)
- `src/pages/Dashboard.tsx` — replace single fetch with paginated + searchable fetch per tab; debounce hook inline.
- Everything else from the prior plan unchanged (glass tokens, `PageContainer`, `ProjectCard`, project-wide glass styling, Navbar, modals, memory updates).

### Analytics addition
- `dashboard_search` button event already planned; now also includes `query_length` (not the query itself — avoid PII).

