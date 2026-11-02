# Logging flow

## Status

deterministic

## Sub-features

- Tapping today's cell moves the editor to that day and reports nothing logged.
- Choosing `Bleeding` turns the status into `Bleeding` and writes `cycle.logs` to `localStorage`.
- Reloading keeps the logged day.
- A logged day offers `Clear this day`; choosing it clears the day and the status returns to `Nothing logged`.
- `Mark a range` arms a range from the selected day; tapping another day previews the span, and `Mark N days as bleeding` writes every day in it with one save.

## How to get to it (user POV)

Open the app. Tap any day in the month calendar (today's cell is marked). Pick bleeding or spotting. The big status line changes from a prediction to `Day N` plus `Bleeding`. Reload; it is still there. Tap `Clear this day` to undo it.

Catching up on a forgotten period: tap one end of the run, tap `Mark a range`, tap the other end, then `Mark 4 days as bleeding`. The calendar darkens the days in between, so the span is visible before it is written.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs flow
```

The flow finds today's cell (`[data-slot="calendar-cell"][data-today] button`) by its `aria-label`, clicks through real mouse events, reads `[role="status"]` and `localStorage.getItem('cycle.logs')`, then reloads and repeats. Clearing goes through `[data-slot="button"]` with the text `Clear this day`. The range step arms with `Mark a range`, clicks the cell three positions before today in the rendered grid, and asserts four entries in storage.

## Gotchas

- Dates are real. Never hard-code a cell label; the calendar is built from the machine clock. Find today by `[data-slot="calendar-cell"][data-today]`.
- The day cell's `aria-label` is the full date, e.g. `"Tuesday, October 20, 2026"`. Past today the cell is disabled, so it cannot be logged.
- There are only two values, `Bleeding` and `Spotting`. An unlogged day has no checked radio at all, and clearing is its own action, so assert `null`, not `'None'`.
- A pending range hides `Mark a range` and shows `Mark N days as …` plus `Cancel`. Both are `[data-slot="button"]`, matched by exact text; the count in the label changes with the span.
- Selecting a day inside a pending range does not write anything; the range is written only on confirm. Cancel puts the editor back with nothing saved.
- A range that crosses a month boundary switches the calendar to the tapped month, and the trailing cells of the next month are still darkened by `data-slot="calendar-cell"][data-range]`.
- `cycle.logs` is an array of `{ date, flow }`. The app sorts it; do not assert insertion order across runs.
- The drive starts a fresh Chrome profile, so `localStorage` begins empty. Do not point it at your normal browser profile.
- Prediction can be switched off on the About tab. If a prior flow leaves it off, the status says `Prediction is off.` Reload before asserting prediction text.

## Promotion Criteria

An e2e spec that logs a day, asserts the status and the stored JSON, reloads, asserts persistence, then clears. A second spec for the range: arm, tap the far end, assert the preview, confirm, assert one write per day. Needs a clean `localStorage` per test (a browser context or `page.addInitScript`), and a fixed clock if the date matters.
