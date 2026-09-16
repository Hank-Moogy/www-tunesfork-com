# Working in this repo

Short pointers for whoever picks the work up next. Details live in `docs/`.

## Before touching the web app's UI

Read **`docs/DESIGN_SYSTEM.md`**. The web app was rebuilt onto a dark,
token-driven system; the document explains the tokens and, more usefully,
lists four mistakes that have already shipped to production. The two that
cost the most:

- **`--accent` is shadcn's hover surface, not the brand.** The brand green is
  `--brand`, exposed as `--primary`. Repointing `--accent` at the brand turns
  every dropdown item and ghost button solid green on hover — and it once
  made the contribution heatmap invisible.
- **A green fill means "action"; a green dot means "done".** `.tf-lamp` is
  the state signal. A synced project must not look like a button.

There is no light theme. `bg-white/*`, `text-black`, `bg-amber-50` and
similar are residue from the old glassmorphism theme and will render as
bright bars on a black page.

## Before launching

`docs/LAUNCH_READINESS.md` ends with **"Onboarding: what must be tested before
launch"** — twelve checks, none of which the test suite can cover. The first-run
flow derives its progress from signals produced by the tray app and by Ableton,
so it has never been exercised end to end; it needs a fresh account and a real
macOS install. Half the list is about the flow not trapping anyone, which is the
half most likely to be skipped.

## Before planning launch-scoped work

Read `docs/LAUNCH_READINESS.md` and the launch plan. Storage, quotas,
analytics, billing and macOS distribution all have decisions already made
that are easy to contradict.

## Git

`main` is the default branch and what Vercel deploys. Always branch from
`origin/main`.

The working tree often carries uncommitted work from parallel sessions —
typically `electron/*.cjs`, `src/App.tsx`, `src/pages/LandingPage.tsx` and
`supabase/config.toml`. Leave it alone: stage by explicit path, never
`git add -A` or `git commit -a`, and do not reset, checkout, clean or stash
the shared tree. The git stash stack is shared across all worktrees, so a
bare `git stash pop` can take someone else's work.

## Verifying UI

Most pages are behind auth and there is no seeded local database. Use a
throwaway Vite entry (`preview.html` + `src/__preview.tsx`) that mounts
components with mock props, and delete it afterwards. **Do not add a preview
route to `src/App.tsx`** — that file is edited in parallel constantly.
`docs/DESIGN_SYSTEM.md` has the details.
