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
| Accent | green `#45ff72` | orange `#ff6534` | **purple** |
| Idiom | editorial / brutalist | skeuomorphic eurorack | VisionOS glass |

The web app was not merely off-brand, it was the opposite brand. It now
descends from the tray app's palette, because the tray app is the shipping
product, with two deliberate changes:

- **Green `#45ff72` carries the CTA**, not orange. The tray app will be
  aligned to this later; until then the two disagree on purpose.
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

## Not done yet

- **Onboarding.** The real first-run gap. `src/pages/Onboarding.tsx` collects
  a survey and shows three tour cards, but never gets a new user to first
  value: install Sync → connect Ableton → watch version one appear.
- **Layout passes** on Billing, DesktopApp, Admin and Share. Tokens are
  correct; the shape is untouched.
- **The tray app** still leads with orange. Aligning it to green is a
  deliberate, separate piece of work.
- **`Like` on project comments** was removed rather than left as a dead
  button. It needs a table before it can come back.
