# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: true

## Project Notes

`cycle` is a private, single-user period tracker. Local only: no account, no network permission, no analytics, no telemetry. Data lives in `localStorage` under `cycle.logs`.

### Package manager and checks

Nub, not npm, for everything that runs: `nub run dev`, `nub run test`, `nub run score`. Installs go through `nub install`, which reads the tracked `package-lock.json`.

After any change, run `nub run check` (typecheck, vitest, lint including the Effect rules, then one build).

For anything that touches layout, overlays or event delivery, also run the browser check. `foldkit/scene` runs in happy-dom and cannot see stacking or CSS, which is how a closed `<dialog>` with `display: grid` once covered the whole page:

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/doctor.mjs
node .agents/skills/verify-cycle/scripts/drive.mjs
.agents/skills/verify-cycle/scripts/stop.sh
```

### Layout

`apps/web` is the Vite app. Its styled components live in `apps/web/src/components/ui`, copied into the app in the shadcn style rather than kept in a workspace package. `packages/domain` is date maths, period grouping, the predictor and the scoring harness; it has no Foldkit or DOM import, which is what lets the CLI and the app share it.

`vitest` runs one root config over `apps/**` and `packages/**`, with the StyleX plugin inlined. StyleX's plugin leaks a 150ms interval into the vitest worker, so the run prints `something prevents 2 Vite servers from exiting` and waits ten seconds before closing. Tests have already passed at that point.

### UI rules

- Components come from `@foldkit/ui`. Do not hand-write a component the library ships. Its submodels (Calendar, Tabs, RadioGroup, Popover, Tooltip, Dialog, Menu) own their own open/closed, active-item and focus state.
- Stateful components are submodels: put their `Model` in the app `Model`, embed with `h.submodel` (a unique `slotId` per rendered position), and drive them through `Update.foldChild`. Lift their `OutMessage` to app state in `foldOutMessage`; do not mirror their state in app booleans.
- `apps/web/src/components/ui` is a copy-owned styled layer, not a package. Each module re-exports the headless module and adds a `render`/`renderConfig` that takes the library's `RenderInfo`. Styles never live at the call site; app-level layout is a local StyleX block in `apps/web/src/main.ts`.
- StyleX needs a `*.stylex.js` file for shared values, and those values must come from `stylex.defineVars`/`defineConsts`. Bare imported scalars are rejected, so write them inline.
- Read `apps/web/src/components/ui/README.md` before adding a renderer.
- No radius, no shadow, no animation, no accent colour. Flow is encoded in ink levels, and state is written in words.
- Mobile first: base styles are the phone, and `@media (min-width: 48rem)` is where a layout relaxes for a wide window. The section nav is a fixed bottom bar on a phone and the inline row above the panel on desktop; both branches are the same DOM. `Tabs.list` owns the row, `styles.nav` in `main.ts` owns the bar.
- Anything tappable is at least 44px in one dimension (`size.tap`), and labels are one word. The nav is text only; no icons, no pill, no fill.
- The page reserves the bar's height plus `env(safe-area-inset-bottom)`; the bar reserves the same inset. `viewport-fit=cover` in `index.html` is what makes those insets non-zero.
- Controls are typed, not filled: a selected tab, flow level or day is full ink plus an underline/border, never a background.

### Foldkit reference

The live Foldkit source is not vendored into this repo. A shallow clone of the matching release lives at `/tmp/references/foldkit` (`foldkit@0.170.0`), alongside `examples/` and `packages/foldkit/src/`. Treat it as read-only reference; imports always come from the `foldkit` npm package. Re-clone it after upgrading Foldkit:

```sh
git clone --depth 1 --branch "foldkit@$(node -p "require('./node_modules/foldkit/package.json').version")" https://github.com/foldkit/foldkit.git /tmp/references/foldkit
```

### Domain vocabulary

- **flow** — a day's bleeding: `Spotting | Bleeding`. Spotting is not bleeding. The three heaviness levels an earlier build stored (`Light | Medium | Heavy`) are folded into `Bleeding` on boot; nothing writes them.
- **range** — two dates picked in the calendar and filled with the same flow in one save. Stored as one log per day, so nothing downstream knows about ranges.
- **missed log** — a gap over 1.6× her median once three lengths exist. It is not removed from the logs or the calendar; it is labelled in History and left out of the estimate (`isLikelySkip`). Verified against synthetic merges in `nub run score`.
- **period** — a run of bleeding days. Derived from day logs, never stored. A bleeding day starts a new period only when there were two clear days before it; trailing spotting within one day extends the end.
- **cycle length** — the gap between two period starts, kept only in 15–90 days.
- **cycle state** — `NoCycles | Expected | Late | Overdue`. `Overdue` is measured against the _unshifted_ window, so it is reachable while the live window is still sliding forward.
- **window** — `{ low, high, mostLikely }` date keys. The UI shows the range, never only `mostLikely`.

### Rules that are load-bearing

- Dates are `YYYY-MM-DD` strings, and day arithmetic goes through `packages/domain/src/date.ts` in UTC. Never subtract local `Date` objects; that is where the off-by-one days come from.
- Round the window outward (`floor` the low, `ceil` the high). Never inward.
- No ovulation, fertile-window, safe-day, or contraception output. Date-only tracking cannot support it.
- `today` comes from Flags at boot. There is no midnight rollover yet; if you add one, add it as a Command or Subscription, never by calling `Date.now()` while building a Command.
- Scoring is the regression test for the predictor: `nub run score` prints the table. If a change moves MAE or the ±2 column, say so.

### Data

`data/` is gitignored. It holds the Marquette/Fehring cycle data downloaded by `packages/domain/scripts/fetch-dataset.ts`, for local scoring only. Do not commit it, do not redistribute it, do not ship it in the build.

### Background

The research behind the algorithm and the UX choices lives in the Obsidian vault: `ref/period-tracker-research.md` and `ref/period-tracker-tracking-and-ux.md`.
