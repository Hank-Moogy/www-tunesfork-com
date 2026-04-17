
## Goal
Create a new producer-focused landing page as the default at `/welcome`, and move the current GitHub-themed landing page to `/welcome/producers-github` (or similar) so it stays accessible via direct URL.

## Approach

**1. Rename existing file**
- Copy `src/pages/LandingPage.tsx` → `src/pages/LandingPageGithub.tsx` (unchanged content — keeps the "GitHub of music production" angle for technical users).

**2. Create new default landing page**
- New file: `src/pages/LandingPage.tsx` (replaces current).
- Keep the **exact same structure**: nav, hero, features grid, founder quote, final CTA, footer.
- Only change the **hero copy** to speak directly to music producers (no GitHub/version-control jargon in the headline).
- Keep features, quote, and CTA sections identical (they already read well for producers).

**Proposed new hero copy:**
- Eyebrow chip: "Built by producers, for producers" (unchanged)
- Headline: **"Never lose a beat. Never lose a project."**
  - With gradient accent on "Never lose a project."
- Subhead: "Back up your Ableton sessions to the cloud, collaborate with other artists, and pick up exactly where you left off — on any machine. TunesFork is the safety net every producer needs."
- CTAs unchanged ("Start for free" / "See how it works")

**3. Wire up routes in `src/App.tsx`**
- `/welcome` → new `LandingPage` (producer-focused, default)
- `/welcome/github` → `LandingPageGithub` (preserves the original for direct-URL access)

## Files touched
- `src/pages/LandingPage.tsx` — rewritten hero, rest kept
- `src/pages/LandingPageGithub.tsx` — new file, copy of current landing page
- `src/App.tsx` — add one route for `/welcome/github`

## Out of scope
- No design token changes
- No new components
- No backend changes
- Pricing CTAs stay "Coming Soon" (per previous instruction)
