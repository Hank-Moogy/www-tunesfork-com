# Tunesfork design system

The web app's visual language, why it is shaped this way, and the traps that
have already caught someone. Read the "Rules that are easy to break" section
before touching colour — three of the four items there describe bugs that
actually shipped.

Scope: `src/` (the web app). The Sync tray app (`electron/src/tray-ui/`) and
the landing page (`src/pages/LandingPageGalaxyClassic.*`) keep their own CSS
and are **not** governed by these tokens yet.

---

## Where it came from

Three surfaces had drifted into three unrelated design languages:

| | Landing page | Sync tray app | Web app (before) |
|---|---|---|---|
| Ground | `#050505` black | `#0e0f11` brushed metal | `#f7f8fa` **light** |
| Accent | green `#45ff72` | green `#45ff72` | **purple** |
| Idiom | editorial / brutalist | skeuomorphic eurorack | VisionOS glass |

The web app was not merely off-brand, it was the opposite brand. It now
descends from the tray app's palette, because the tray app is the shipping
product, with two deliberate changes:

- **Green `#45ff72` carries the CTA**, not orange. The tray app now leads with
  the same green, so the three surfaces finally agree.
- **Surfaces come from [Ambientic's art direction]** — translucent films of
  light over a cool ground rather than opaque grey tiles. See
  `ART_DIRECTION.md` in the Ambientic repo for the source. The ideas borrowed
  are "light moving through translucent material", "a lit element is a light
  source, not a coloured tile", and "waiting is drawn as the shape of the
  answer".

Dark only. There is no light theme and no `dark:` variant — do not add one
without a decision, because every token below assumes a single theme.

---

## The tokens

All in `src/index.css`. Colour values are **HSL triplets**, not full colours,
because the 49 shadcn primitives consume them as `hsl(var(--token))`. Keep
that format or the primitives break.

### Colour roles

| Token | Means | Use for |
|---|---|---|
| `--brand` | `#45ff72`, the identity | Primary CTA. Exposed as `--primary`, so a bare `<Button>` is already correct |
| `--accent` | **shadcn's hover surface** | Never the brand. See the traps below |
| `--status-synced` | live / done / ready | green |
| `--status-syncing` | in flight | cyan |
| `--status-pending` | waiting, warning, unshipped | amber |
| `--status-error` | failed | red |
| `--status-idle` | archived, inactive | grey |
| `--data-1..6` | categorical identity **only** | storage breakdown, stat tints, histograms |

Tailwind names: `bg-brand`, `text-status-synced`, `bg-data-2`, and so on.

### Surfaces

Two families, and they are not interchangeable:

- **Solid ramp** — `--background` → `--surface-1/2/3`. Use when something
  *is* the page.
- **Films** — `--film-1/2/3`, faint white over the ground. Use when something
  *floats* on the page. Films stack: a film over a film is legitimately
  brighter. `--edge` / `--edge-strong` are the hairlines, and they are light,
  not dark lines.

Consume films as `bg-[rgb(var(--film-2))]`, not `bg-white/5`.

### Component classes

| Class | What it is |
|---|---|
| `.tf-surface` | A panel that floats. Top-light + hairline, no drop shadow |
| `.tf-well` | Something recessed *into* a surface — inputs, code, the heatmap field. Darker than its parent |
| `.tf-glass` | Chrome: nav bars, sticky headers, overlays. Blur + saturate |
| `.tf-lit` | A light source. Set `--glow` to any colour; defaults to brand |
| `.tf-lamp` | Status dot. `data-state="synced|syncing|pending|error"` |
| `.tf-mark` | Knocks `logo.png` out to white. It is a dark 3D render |
| `.tf-label` | Mono micro-label, uppercase, letterspaced |
| `.tf-breathe` / `.tf-drift` | Ambient loops, 7s / 13s |
| `.tf-pending` | Skeleton that sweeps. Stagger with `--tf-delay` |

Never use `shadow-*` for elevation. On a near-black page a drop shadow reads
as mud; elevation is carried by surface colour and by the edge catching more
light.

---

## Rules that are easy to break

**1. `--accent` is not the brand.** In shadcn's vocabulary `accent` is the
subtle hover/active surface, used in 33 places across 10 primitives
(dropdown items, ghost buttons, calendar selection, command rows). Pointing
it at the brand green turns every one of those solid green on hover. The
brand is `--brand`, exposed through `--primary`. *This shipped once: 47 call
sites outside `components/ui` were using `accent` to mean the brand colour,
and when accent became a quiet surface the contribution heatmap turned
dark-grey-on-dark-grey and vanished entirely.*

**2. Green fill means action; a green dot means state.** Green does double
duty, so the two uses are kept visually distinct. A filled green surface is
a button. "Done / synced / live" is a glowing dot (`.tf-lamp`), copied from
the tray app's pilot lights. A READY project must not look like something to
click. *This shipped too: project cards drew READY as a green pill.*

**3. Colour names must say what they mean.** The old `pastel-*` scale named
the hue and nothing else, so one `pastel-green` marked a successful sample
check, a storage segment and a decorative stat tint. Use `status-*` for
state and `data-*` for category. Two `--pastel-*` variables survive, aliased
onto the data ramp, only because `src/pages/LandingPage.tsx` reads them raw;
delete them once that file's gradient moves to `data-2`/`data-4`.

**4. Watch for light-theme residue.** `bg-white/40`, `ring-white`,
`text-black`, `bg-amber-50` and friends are leftovers from the glassmorphism
theme. They are all gone now; if one reappears it will render as a bright
bar across a black page. *The navbar shipped as `bg-white/60` — a 60% white
strip across the top of the app.*

---

## Motion

`motion` (formerly Framer Motion) is a dependency as of this work. It costs
**~48 KB gzip** and currently earns it on exactly one surface, so weigh
adding more.

Timings come from Ambientic: ambient cycles 6–16s, interface transitions
180–500ms with gentle acceleration and a long settle. Prefer spatial waves,
opacity drift and subtle parallax over bounce.

- **CSS** (`.tf-breathe`, `.tf-drift`, `.tf-pending`) handles ambient motion
  that loops forever and ignores state. Cheapest; prefer it.
- **`motion`** handles what CSS cannot: enter/exit transitions, gesture and
  spring physics, orchestrated sequences. Used on `ProjectCard`, where cards
  arrive as one staggered wave (delay derived from grid index) and lift under
  the pointer.

Every animation must honour `prefers-reduced-motion`. Use
`useReducedMotion()` from `motion/react` in components and the media query in
CSS. Reduced motion keeps depth, colour and hierarchy — it only stops the
field from moving.

---

## Verifying UI work

Most of the app is behind auth, and there is no seeded local database.

- `.env` holds the **production** Supabase project, so signing in locally
  works but touches real data.
- A local stack is possible (`supabase/` has config + migrations, CLI is
  installed) but needs Docker.
- For design work, the cheapest path is a throwaway Vite entry: a
  `preview.html` plus a `src/__preview.tsx` that mounts the components with
  mock props. **Do not add a route to `src/App.tsx` for this** — that file is
  frequently edited in parallel. Delete both files when done.

No Playwright browser is installed, but `playwright` is a dependency and
system Chrome works:

```js
chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
```

Measure computed styles and geometry rather than eyeballing — every bug in
"Rules that are easy to break" was found by reading a computed value, not by
looking at a screenshot.

---

## Onboarding

`src/pages/Onboarding.tsx` is a six-step first-run flow shaped like a
character-setup screen: one decision per page, the object being configured lit
at the centre (`components/onboarding/Stage.tsx` tilts it toward the pointer on
a spring), and progress as a column of lamps that never reorders.

**Progress is derived, never counted.** `useOnboardingProgress` reads real
signals — `profiles.display_name`, a live row in `device_tokens`, owned
`projects`, a `share_token` or collaborator. There is no step column, on
purpose: most of these steps complete *outside* the web app (pairing happens
in the tray app, a backup happens in Ableton), so a stored counter would
immediately disagree with reality. While the user sits on a step that
completes elsewhere the page polls, and the screen advances itself the moment
the thing actually happens.

The one unobservable signal is the install click — a browser cannot see a
download. It is remembered in `localStorage` and superseded as soon as a
device pairs, since you cannot pair without having installed.

### Testing it

Progress is derived from real data, so an established account is already past
the gate and will never see the flow. Two dev-only URL overrides exist for
this, both compiled out of production by `import.meta.env.DEV`:

| Override | Does |
|---|---|
| `/onboarding?tf_step=share` | Jump to any step (`name`, `install`, `pair`, `backup`, `share`, `watch`) |
| `/onboarding?tf_platform=windows` | Force the non-macOS branch |
| Dev step skipper | A Prev/Next control, top right of the onboarding screen. Past the last setup step it becomes "Preview rest →" and lands on the dashboard below |
| `/dashboard?tf_preview=1` | The post-setup dashboard with fixture projects and both reminders showing |
| `/project/tf-preview-project?onboard=share&tf_preview=1` | A fixture project with the share spotlight up |

Preview mode injects fixtures (`lib/devPreview.ts`) into the **real** pages
rather than rendering a mock screen, so what you review is the shipping
component and cannot drift from it. Every fixture is wrapped in an
`import.meta.env.DEV` ternary so Vite folds it away at build time — runtime
gating alone was not enough, and the first attempt shipped the fixture data
into the production bundle. If you add fixtures, grep `dist/assets/*.js` for
their strings before trusting them.

The platform one exists because the Windows path is otherwise unreachable from
a Mac: `navigator.platform` stays `"MacIntel"` even under a DevTools
user-agent override.

To exercise the flow for real rather than preview it, sign up a fresh account —
that is the only way to see the gate actually hold and release.

**The stepper covers setup only** — the four things that must happen before
Tunesfork does anything for you. Sharing a project and watching a whole folder
are improvements on a working setup, so they are not steps and must not gate
anything:

| | Where it lives |
|---|---|
| Setup: name, install, pair, backup | `pages/Onboarding.tsx`, a four-step rail |
| Share a project | `components/onboarding/SetupReminders.tsx` on the dashboard, plus a one-time `Coachmark.tsx` spotlight on the real Share control when onboarding hands off (`/project/:id?onboard=share`) |
| Back up everything | the same dashboard reminders panel |

Completing the backup hands the user to their new project with the share
spotlight armed. The two remaining tasks then continue as a vertical stepper at
the top of the dashboard, numbered 5 and 6 so it reads as the same journey
rather than a new widget. Every step exits: an X per row, and an X on the panel
for all of them. Dismissals persist in `tf_dismissed_reminders`.

The download button fires the asset URL directly and stays put — an `<a href>`
to the marketing page abandoned the flow mid-way, which is why step two used to
appear to do nothing.

**The gate lives in `ProtectedRoute`,** not in `App.tsx`, which is edited in
parallel constantly. The app opens once a device is paired *and* one project is
backed up. Steps 5 and 6 are in-app nudges and never block.

**Everything fails open.** An unreadable progress query, a request that never
settles, an unknown platform — each lets the user through. Being wrongly let
into the app is a minor annoyance; being wrongly locked out of your own projects
cannot be recovered from inside the product. The escape link on the onboarding
screen is always present for the same reason. See the "Must not trap" checks in
`LAUNCH_READINESS.md`.

**Projects only enter through the tray app.** There is no browser upload: the
web ZIP path was closed at the database, and the frontend entry points that
implied otherwise (a drag-and-drop tile, an "Upload" button, an "or upload a
project manually" link that actually opened the download page) have been
removed. Do not reintroduce upload-shaped UI for a path that does not exist.

> **Sync ships for macOS only.** Gating every user on "install and pair" would
> permanently trap Windows users: they cannot install, and the web ZIP upload
> path was closed at the database, so they cannot back up either. `unlocked`
> therefore returns true on non-macOS, and those users get the Windows waitlist
> (`sync_waitlist`, surfaced in AdminPage) instead of a door with no key.
> **Do not "simplify" this check away.**

## Not done yet

- **Layout passes** on Billing, DesktopApp, Admin and Share. Tokens are
  correct; the shape is untouched.
- **`Like` on project comments** was removed rather than left as a dead
  button. It needs a table before it can come back.
