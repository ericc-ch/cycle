# Logging flow

## Status

deterministic

## Sub-features

- Tapping today's cell moves the editor to that day and reports nothing logged.
- Choosing `Light` turns the status into `Bleeding · light` and writes `cycle.logs` to `localStorage`.
- Reloading keeps the logged day.
- Choosing `None` clears the day and the status returns to `Nothing logged`.

## How to get to it (user POV)

Open the app. Tap any day in the two-week strip (the last cell is today). Pick a flow level. The big status line changes from a prediction to `Day N` plus `Bleeding · light`. Reload; it is still there.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs flow
```

The flow finds the last `button[aria-pressed]` (today's cell) by its `aria-label`, clicks through real mouse events, reads `[role="status"]` and `localStorage.getItem('cycle.logs')`, then reloads and repeats.

## Gotchas

- Dates are real. Never hard-code a cell label; the strip is relative to the machine clock. Find today by taking the last `button[aria-pressed]`.
- The day cell's `aria-label` is `"Mon 2, nothing logged"`; `dayOfMonthLabel` has no month, so do not match on "2 Nov".
- `cycle.logs` is an array of `{ date, flow }`. The app sorts it; do not assert insertion order across runs.
- The drive starts a fresh Chrome profile, so `localStorage` begins empty. Do not point it at your normal browser profile.
- Prediction can be switched off on the About tab. If a prior flow leaves it off, the status says `Prediction is off.` Reload before asserting prediction text.

## Promotion Criteria

An e2e spec that logs a day, asserts the status and the stored JSON, reloads, asserts persistence, then clears. Needs a clean `localStorage` per test (a browser context or `page.addInitScript`), and a fixed clock if the date matters.
