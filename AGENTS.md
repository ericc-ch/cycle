# Agent Development Notes

## Project Notes

`cycle` is a private, single-user period tracker. Local only: no account, no network permission, no analytics, no telemetry. Data lives in `localStorage` under `cycle.logs`.

### Package manager and checks

pnpm, not npm, is the package manager (`pnpm install`, `pnpm run <script>`).

Run `pnpm run check` after any change. It typechecks, tests, lints and builds.

Anything that touches layout, overlays or event delivery also needs a real browser. Run the `verify-cycle` skill; its `SKILL.md` has the launch, doctor, drive and stop commands. The unit tests run in happy-dom and cannot see stacking or CSS.

### Layout

`apps/web` is the Vite app. `src/state.ts` owns the model, the draft, the pure reducer, the Effect atoms and storage; `src/app.tsx` wires the atoms and `AppShell` stays presentational; `src/views/` holds the three panels, and the calendar is the whole of Today, with the mode bar above it and the actions under it. `src/domain.ts` is the app's only route into `packages/domain`.

State is an [Effect Atom](https://effect.website/docs/state-management/atom) (`effect/reactivity` with `@effect/atom-react`): `modelAtom` holds the `Model`, `periodsAtom` derives the periods, and `dispatchAtom` sends an `Action` through the pure reducer and writes the logs once when they change. Edits happen in `model.draft`, and `SavedEditing` is the only action that copies it into `model.logs`. `RegistryProvider` in `src/entry.tsx` owns the registry.

`packages/domain` is date maths, period grouping, the predictor and the scoring harness. It uses Effect internally, has no React or DOM import, and is shared by the CLI and the app.

`vitest` runs one root config over `apps/**` and `packages/**` in happy-dom. Web tests render the real `App` inside `RegistryProvider`, seeding `modelAtom` with a fixed model. React Aria's keyboard movement and the paint gesture belong to the browser check.

### UI rules

- Components come from `apps/web/src/components/ui`, shadcn's copy-owned model on the React Aria base (`aria-nova`). React Aria owns the behaviour of Button, Tabs, Dialog, AlertDialog, RadioGroup, Switch, Popover and the calendar; the files own the markup and the classes. Read `apps/web/src/components/ui/README.md` before adding or changing one.
- React Aria's state markers are `data-selected` and `data-disabled`. The app's own elements keep `data-state`, such as the edit banner's `dirty`/`clean`.
- Editing is explicit, and the hold is the only way in. Read-only, the calendar takes no write: a tap writes nothing, a swipe keeps the page scrolling, and a hold opens the mode on the held day without writing it. The mode card sits in the status card's slot at the same height, so entering the mode never moves the month: `Editing` / `Unsaved changes` on the left with `Save` and `Cancel` beside it, the flow pen on the second row. In the mode every day is a toggle: a tap flips one day, a drag flips each day it covers.
- The calendar is React Aria's `Calendar` over `PlainDate`. The paint gesture is a pure machine in `src/gesture.ts`: the component only turns pointer events into its events and runs the effects it returns. The flow marks and the haptics are ours too.
- Haptics come from `web-haptics` through `src/haptics.ts`, never raw `navigator.vibrate`: `hold` is `heavy`, crossing a day is `selection`, Save is `success`, entering or cancelling is `light`. iOS 26.5+ has no web haptics, so the UI must read without them.
- Tailwind classes live in the component or view that renders the element. Shared values live in `src/styles.css`.
- No radius, no shadow, no animation. Flow is the only colour: a full `--color-bleeding` rule, a short `--color-spotting` one. Every other state is words and ink levels.
- Mobile first: the base styles are the phone and there is one layout at every width. The section nav is a fixed bottom bar everywhere; the column stops widening at `--measure`. Add a `md:` variant only when a phone rule genuinely breaks on a wide window.
- Anything tappable is at least 44px in one dimension, and the nav labels are one word. The calendar, the nav and the actions under the calendar keep the 44px height. The mode card's `Save`, `Cancel` and flow items are the one exception: 36px tall and well over 44px wide, so the card stays inside the status card's height. The switch keeps its 34×18 track and expands its hit area with a pseudo-element.
- The page reserves the bar's height plus `env(safe-area-inset-bottom)`, and the bar reserves the same inset. `viewport-fit=cover` in `index.html` is what makes those insets non-zero.
- Controls are typed, not filled: a selected tab, flow level or day is full ink plus an underline or a 1px border, never a background.

### Domain vocabulary

- **flow** — a day's bleeding: `Spotting | Bleeding`. Spotting is not bleeding. The heaviness levels an earlier build stored (`Light | Medium | Heavy`) fold into `Bleeding` on boot; nothing writes them.
- **range** — two dates painted with the same flow. It lives in the draft and is written as one log per day on Save, so nothing downstream knows about ranges.
- **missed log** — a gap over 1.6× her median once three lengths exist. It stays in the logs and the calendar; History labels it and the estimate leaves it out (`isLikelySkip`).
- **period** — a run of bleeding days, derived from day logs, never stored. A bleeding day starts a new period only after two clear days; trailing spotting within one day extends the end.
- **cycle length** — the gap between two period starts, kept only in 15–90 days.
- **cycle state** — `NoCycles | Expected | Late | Overdue`. `Overdue` is measured against the unshifted window, so it is reachable while the live window still slides forward.
- **window** — `{ low, high, mostLikely }` as `PlainDate`s. The UI shows the range, never only `mostLikely`.

### Rules that are load-bearing

- Hold a date as `PlainDate` (`CalendarDate`): a day with no time and no zone. `YYYY-MM-DD` exists only at the storage boundary (`formatPlainDate` / `parsePlainDate` in `packages/domain/src/date.ts`). A JS `Date` carries a zone, so `new Date('2026-11-10')` is the previous day west of UTC.
- Round the window outward (`floor` the low, `ceil` the high). Never inward.
- No ovulation, fertile-window, safe-day, or contraception output. Date-only tracking cannot support it.
- `today` is read once in `initModel` with `todayPlainDate()`, which uses the local calendar day. There is no midnight rollover; add one as a timer effect, never by calling `Date.now()` during render. `I18nProvider locale="en-GB"` wraps the app so calendar labels agree with the domain formatters.
- Scoring is the regression test for the predictor: `pnpm run score` prints the table. If a change moves MAE or the ±2 column, say so.

### Data

`data/` is gitignored. It holds the Marquette/Fehring cycle data downloaded by `packages/domain/scripts/fetch-dataset.ts`, for local scoring only. Do not commit it, redistribute it, or ship it in the build.

### Background

The research behind the algorithm and the UX choices lives in the Obsidian vault: `ref/period-tracker-research.md` and `ref/period-tracker-tracking-and-ux.md`.
