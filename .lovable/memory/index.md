# Memory: index.md
Updated: today

# Project Memory

## Core
Light VisionOS / Glassmorphism theme. Soft pastel mesh bg, white/60 + backdrop-blur surfaces via `.glass-card` / `.glass-panel` / `.glass-pill` / `.glass-input`. Radius 1rem (rounded-2xl).
Accent = electric green (--accent 142 70% 45%) — used for primary CTAs (Upload Project, etc). Do not change CTA color to match mock palettes.
Roboto body, Roboto Mono for BPM/dates/metadata.
Page layout: `PageContainer` (max-w-7xl, px-6/lg:px-10, py-10, space-y-8). Use across primary pages.
Dashboard project grid: 4 cols xl, 3 lg, 2 sm, 1 base. Cards = gradient art header (h-36, name-hashed hue) + glass body + status pill + collaborator avatar stack. "+ New Project" dashed glass tile is last grid item.
Project search = backend (`ilike` on name), debounced 250ms. Pagination via `.range()` page size 12 with "Show more". Archived hidden by default.
Lovable Cloud backend. Auth: email + Google OAuth.

## Memories
- [Design tokens](mem://design/tokens) — Color palette, glass utilities, status colors, typography
- [App plan](mem://features/plan) — Cloudbleton phases: auth → dashboard → upload → project detail → sharing → polish
