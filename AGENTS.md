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

### Layout

`apps/web` is the Vite app. `packages/domain` is date maths, period grouping, the predictor and the scoring harness; it has no Foldkit or DOM import, which is what lets the CLI and the app share it. `packages/ui` is the styled component kit.

`vitest` runs one root config over `apps/**` and `packages/**`, with the StyleX plugin inlined. StyleX's plugin leaks a 150ms interval into the vitest worker, so the run prints `something prevents 2 Vite servers from exiting` and waits ten seconds before closing. Tests have already passed at that point.

### UI rules

- Components are plain `view(props, h) => Html` functions. State and messages stay in the app; do not add a submodel to a component.
- Styles live in `packages/ui`; the app composes components and never re-styles them. App-level styles are local StyleX blocks in `apps/web/src/main.ts`.
- StyleX needs a `*.stylex.js` file for shared values, and those values must come from `stylex.defineVars`/`defineConsts`. Bare imported scalars are rejected, so write them inline.
- Read `packages/ui/README.md` before adding a component; it lists the keyboard/ARIA contract and the deliberate gaps.
- No radius, no shadow, no animation, no accent colour. Flow is encoded in ink levels, and state is written in words.

### Foldkit reference

The live Foldkit source is not vendored into this repo. A shallow clone of the matching release lives at `/tmp/references/foldkit` (`foldkit@0.170.0`), alongside `examples/` and `packages/foldkit/src/`. Treat it as read-only reference; imports always come from the `foldkit` npm package. Re-clone it after upgrading Foldkit:

```sh
git clone --depth 1 --branch "foldkit@$(node -p "require('./node_modules/foldkit/package.json').version")" https://github.com/foldkit/foldkit.git /tmp/references/foldkit
```

### Domain vocabulary

- **flow** — a day's bleeding level: `Spotting | Light | Medium | Heavy`. Spotting is not bleeding.
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
