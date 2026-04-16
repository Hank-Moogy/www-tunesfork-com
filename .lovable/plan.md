

## Plan: Plugin Catalog with Fuzzy Matching + Community Submissions

### Overview
Create a global plugin catalog table, seed it with ~200+ popular VST/AU plugins, show "have/missing" status on project pages, and let users submit unknown plugins.

### Database Changes

**1. New table: `plugin_catalog`**
- `id` (uuid, PK)
- `name` (text, unique) — canonical display name (e.g. "Serum")
- `developer` (text) — manufacturer (e.g. "Xfer Records")
- `type` (text) — "VST", "AU", "Both", "Unknown"
- `website_url` (text) — direct link to purchase/download page
- `logo_url` (text, nullable) — optional plugin logo
- `normalized_name` (text) — lowercase, stripped version for fuzzy matching (e.g. "serum")
- `aliases` (jsonb, default '[]') — alternative names for matching (e.g. ["Xfer Serum", "Serum FX"])
- `is_free` (boolean, default false)
- `status` (text, default 'approved') — "approved" or "pending" (for user submissions)
- `submitted_by` (uuid, nullable) — user who submitted if community-contributed
- `created_at`, `updated_at`

RLS: SELECT open to all authenticated users. INSERT allowed for authenticated users (community submissions). UPDATE/DELETE restricted (future admin).

**2. Seed data migration**
Insert ~200 popular plugins (Serum, Omnisphere, Kontakt, Massive X, FabFilter Pro-Q 3, Vital, Diva, Sylenth1, Spire, etc.) with developer names and purchase URLs.

**3. Matching function**
Create a SQL function `match_plugins(plugin_names jsonb)` that:
- Normalizes input names (lowercase, trim whitespace, strip version numbers)
- Matches against `normalized_name` and `aliases` array
- Returns matched catalog entries + unmatched names

### Frontend Changes

**4. Update ProjectPage plugin section** (`src/pages/ProjectPage.tsx`)
- When a version is loaded, call the matching function with the version's `plugin_list`
- Display two groups: "Installed plugins" (matched) and "Unknown plugins" (unmatched)
- Each matched plugin shows: name, developer, and a link icon to the purchase page
- Each unmatched plugin shows a "Submit info" button to contribute

**5. New PluginDetailPage** (`src/pages/PluginPage.tsx`, route `/plugin/:id`)
- Shows plugin name, developer, type, and a prominent "Get Plugin" button linking to the website
- Lists which of the user's projects use this plugin

**6. Submit Plugin dialog**
- Simple form: plugin name (pre-filled), developer, website URL
- Inserts into `plugin_catalog` with `status: 'pending'`

**7. Update SharePage** (`src/pages/SharePage.tsx`)
- Same matched/unmatched display for shared project viewers

**8. Route addition** (`src/App.tsx`)
- Add `/plugin/:id` route (protected)

### Technical Notes
- Fuzzy matching: normalize by lowercasing, removing special chars, and stripping trailing version numbers (e.g. "FabFilter Pro-Q 3" → "fabfilter proq")
- The seed list will cover major categories: synths, samplers, effects, mixing/mastering tools
- No admin UI in this phase — pending submissions can be managed via database
- No new storage buckets needed

