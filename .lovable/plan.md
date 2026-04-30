# Producer Activity Profile

A gamified stats page (`/profile` or `/u/:handle`) that turns every Ableton save into a data point — like GitHub's contribution graph meets Strava's year-in-review.

## What we can mine (zero new tracking needed)

Every `project_versions` row is already a "save". From that one table we can derive:

| Datapoint | Source |
|---|---|
| Total saves (all-time / year / 30d / 7d) | `count(*)` |
| Total projects worked on | `count(distinct project_id)` |
| Daily save heatmap (GitHub-style) | `date_trunc('day', created_at)` |
| Current streak / longest streak | gaps in daily activity |
| Most productive day-of-week & hour-of-day | extract dow / hour |
| Total MB synced to the cloud | `sum(file_size_bytes)` |
| Avg / median session length | gap analysis between consecutive saves |
| BPM distribution (which tempos you live in) | `projects.bpm` per save |
| Average track count per project | `jsonb_array_length(track_list)` |
| Top 10 plugins used | unnest `plugin_list` jsonb, group, count |
| Plugin diversity score | distinct plugins / total saves |
| Collab vs solo ratio | join `collaborators` |
| Versions per project (iteration depth) | avg / max |
| Biggest single save (MB) | `max(file_size_bytes)` |
| First-save anniversary | `min(created_at)` |

## Page layout (`/profile`)

```text
┌────────────────────────────────────────────────────────────┐
│  [Avatar]  Display Name              [Share profile]       │
│            Producing since Jan 2026 · 47 day streak 🔥     │
├────────────────────────────────────────────────────────────┤
│  HERO STATS (4 glass cards)                                │
│  [ 312 saves ] [ 8 projects ] [ 4.2 GB ] [ 47d streak ]    │
├────────────────────────────────────────────────────────────┤
│  CONTRIBUTION HEATMAP — last 365 days                      │
│  GitHub-style grid, hover = "3 saves on Apr 14"            │
│  Year selector ◀ 2026 ▶                                    │
├────────────────────────────────────────────────────────────┤
│  RHYTHM OF WORK   |   GEAR & SOUND                         │
│  • Best day: Sat  |   Top plugins: Serum, Pro-Q3, OTT…     │
│  • Peak hour: 11pm|   Favorite BPM: 128 (32% of projects)  │
│  • Avg session 47m|   Avg tracks: 24                       │
├────────────────────────────────────────────────────────────┤
│  MILESTONES (badges)                                       │
│  🌱 First save · 🎚 100 saves · 🔁 30-day streak · 💾 1GB  │
│  🎹 10 projects · 🤝 First collab · 🦉 Night owl           │
├────────────────────────────────────────────────────────────┤
│  RECENT ACTIVITY (last 10 saves with project names)        │
└────────────────────────────────────────────────────────────┘
```

## Tech approach

**One Postgres view + one RPC** does most of the work — no new tables, no extra tracking.

1. **Migration**: create a `get_user_stats(p_user_id uuid)` SQL function returning a single JSONB blob with all aggregates (hero numbers, heatmap array, top plugins, BPM histogram, etc.). One round-trip per page load. Security: `security definer`, only allow `auth.uid() = p_user_id` OR future "public profile" toggle.
2. **Badges**: derived client-side from the same blob (pure thresholds — no badge table needed yet).
3. **Streak math**: done in SQL with a window function over distinct save-days.

## Components to build

- `src/pages/ProfilePage.tsx` — route `/profile`, fetches `get_user_stats` via supabase rpc
- `src/components/profile/HeroStats.tsx` — 4 glass cards
- `src/components/profile/ContributionHeatmap.tsx` — 53×7 grid, accent-green intensity scale (matches existing CTA color), tooltip on hover, year switcher
- `src/components/profile/RhythmCard.tsx` — best day / peak hour / avg session
- `src/components/profile/GearCard.tsx` — top plugins (with bar bars), favorite BPM, avg tracks
- `src/components/profile/Milestones.tsx` — badge grid (locked = greyscale, unlocked = colored + tooltip with unlock date)
- `src/components/profile/RecentSaves.tsx` — last 10 saves, links to project pages

Add a "Profile" entry to the `Navbar` user menu.

## Phasing

**Phase 1 (this round)** — everything above, private to the logged-in user only. Strava-quality visuals, all real data.

**Phase 2 (later, ask first)** — public/shareable profiles at `/u/:handle` (needs handle field on `profiles` + visibility toggle), weekly recap email, year-in-review modal, leaderboards.

## On the Anthropic / Opus request

Lovable AI doesn't proxy Claude/Opus — we have GPT-5/5.2 and Gemini 3. **None of this feature needs an LLM** — it's all SQL aggregation and React. If you later want an *AI-written weekly recap* ("You leveled up your low-end this week — 4 new bass-focused saves…"), I'd use `google/gemini-3-flash-preview` (fast, cheap, perfect for short generative blurbs). Happy to add that as Phase 1.5 if you want flavor text on the profile.

## Open questions before I build

1. Profile route — `/profile` (yours only, for now) or jump straight to public `/u/:handle`?
2. Add an AI-generated "this week in your studio" blurb above the heatmap?
3. Show stats from collaborators' saves on your shared projects, or only your own saves?
