

## Full Plan: Dark Theme + First-Time User Experience

### 1. Dark Theme with Toggle

**`index.html`** — Add inline script in `<head>` to read `localStorage("theme")` and set `dark` class before paint. Default to `dark`.

**New: `src/hooks/use-theme.ts`** — Hook that manages theme state, toggles `.dark` class on `<html>`, persists to localStorage.

**`src/components/Navbar.tsx`** — Add Sun/Moon toggle button next to the bell icon.

---

### 2. Database Migration

**Add column to `profiles`:**
- `onboarding_completed` boolean default false

**New table: `onboarding_responses`**
- `id` uuid PK
- `user_id` uuid (unique, cascade delete)
- `producer_level` text
- `usage_mode` text
- `music_genres` jsonb
- `referral_source` text
- `completed_at` timestamptz default now()
- RLS: users insert/select own row only

---

### 3. New: `src/pages/Onboarding.tsx`

Multi-step full-screen flow with animated transitions:

**Survey Phase (4 steps):**
1. "What kind of producer are you?" — 3 tappable cards: Amateur, Semi-Pro, Pro
2. "How do you want to use TunesFork?" — 2 cards: Solo (save projects in the cloud) / Multiplayer (collaborate)
3. "What kind of music do you make?" — Multi-select chips: Electronic, Hip-Hop, Band, Sound Design, Sound Art, Traditional, Other
4. "How did you hear about us?" — Single-select chips: Instagram, YouTube, TikTok, Google, AI Chat, From a Friend, Other

**Product Tour Phase (swipeable cards with dot indicators):**
- Card 1 — Founder story with warm gradient background: *"I built TunesFork because I was sick of making music alone in my room and I wanted to secure my projects after I lost all my music when my computer died last year."*
- Card 2 — *"The GitHub of music production"*
- Card 3 — Feature highlights with icons:
  - Automatically save all your Ableton projects in the cloud
  - Collaborate with other artists, share projects, identify missing plugins, comment on versions, track iterations, plan releases, fork versions
  - Open-source your music and get remixes from other producers
- Final CTA: "Let's go" → saves onboarding responses to DB, sets `onboarding_completed = true` on profile, redirects to `/dashboard`

---

### 4. New: `src/components/ShareAfterUploadModal.tsx`

Shown after a user's first-ever project upload:
- Congratulations message
- Email invite field to invite a collaborator
- "Copy share link" button
- "Skip" to dismiss

---

### 5. Modified: `src/contexts/AuthContext.tsx`

- Add `onboardingCompleted: boolean` to context
- After auth state resolves, query `profiles.onboarding_completed`
- Expose it so routing can check it

---

### 6. Modified: `src/pages/Index.tsx`

- If user is logged in but `onboardingCompleted` is false → redirect to `/onboarding`
- Otherwise → redirect to `/dashboard` as before

---

### 7. Modified: `src/App.tsx`

- Add protected route `/onboarding` pointing to `Onboarding` page

---

### 8. Modified: `src/pages/Dashboard.tsx`

- When user has zero projects, replace the current empty state with a large centered CTA: "Save your first project" button that opens the upload modal
- After first successful upload, trigger `ShareAfterUploadModal`

---

### Flow

```text
Sign Up → /onboarding
  ├─ Survey (4 steps)
  ├─ Product Tour (3 swipeable cards)
  └─ "Let's go" → mark complete → /dashboard

Dashboard (0 projects)
  └─ Big centered "Save your first project" CTA
      └─ Upload Modal → success
          └─ Share/Invite Modal
              └─ Dashboard with project card
```

### Design
- Uses existing dark/light CSS variables throughout
- Survey cards: rounded borders, subtle hover scale, gradient accents
- Tour cards: warm gradient backgrounds, large readable text
- Mobile-first (393px viewport), responsive up
- Smooth fade/slide transitions between steps

