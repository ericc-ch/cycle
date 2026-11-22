# Tabs and prediction switch

## Status

deterministic

## Sub-features

- `Today`, `History`, `About` switch the panel and mark the active tab.
- History lists period rows when there are logs.
- A gap over 1.6× her usual cycle is labelled under its row as a probable missed log, and the estimate skips it.
- About renders the prediction switch in the `on` state, next to the word `on`.
- Toggling the switch turns it off, persists to `localStorage`, updates the About label to `off`, and Today reports `Prediction is off.`
- Prediction stays `off` after a reload.

## How to get to it (user POV)

The three words in the bar at the bottom of a phone screen, or the row under `cycle` on a wide window. Tap History to see past periods, About for the switch and the explanation.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs tabs
```

Click `[data-slot="tabs-trigger"]` by text. The active tab carries `data-selected="true"` and `aria-selected`. The switch carries `[data-slot="switch"]` and `data-selected`; click it and read the attribute.

The missed-log case seeds four 30 day cycles and then a 51 day gap, switches to History and expects the sentence `Probably a period you did not log` under exactly one row.

## Gotchas

- React Aria mounts only the active tab's panel, so a selector scoped to another tab finds nothing rather than hidden content.
- Clicking a tab updates the app's `tab` through `onValueChange`; there is no separate focus command to resolve.
- On a phone the bar is `position: fixed`; its height and pinned position are asserted by the `mobile` flow, not here.
- `isPredicting` is stored under `cycle.predicting` in `localStorage`, so a reload preserves it.
- History with no logs shows `Nothing logged yet.`; assert `Periods` only after logging a day.

## Promotion Criteria

An e2e spec that walks all three tabs, asserts `aria-selected`, and toggles the switch. Needs a seeded log for the History rows.
