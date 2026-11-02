# Tabs and prediction switch

## Status

deterministic

## Sub-features

- `Today`, `History`, `About` switch the panel and mark the active tab.
- History lists period rows when there are logs.
- About renders the prediction switch in the `on` state.
- Toggling the switch writes `off`, and Today reports `Prediction is off.`
- Prediction returns to `on` after a reload (it is in-memory, not persisted).

## How to get to it (user POV)

The three words in the bar at the bottom of a phone screen, or the row under `cycle` on a wide window. Tap History to see past periods, About for the switch and the explanation.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs tabs
```

Click `[data-slot="tabs-trigger"]` by text. The active tab carries `data-state="active"`. The switch carries `data-slot="switch"` and `data-state`; click it and read the attribute. After switching to Today, read `[role="status"]`.

## Gotchas

- The tab panel renders only the active tab (`PanelMount.ActiveOnly`), so a selector scoped to another tab's content will find nothing rather than hidden content.
- Clicking a tab dispatches a `FocusTab` command before the app folds the selection. In a scene test that command has to be resolved; in the browser it is not observable.
- On a phone the bar is `position: fixed`; its height and pinned position are asserted by the `mobile` flow, not here.
- `isPredicting` is not stored. A reload resets it, so an assertion that it is still `off` is a bug in the test, not the app.
- History with no logs shows `Nothing logged yet.`; assert `Periods` only after logging a day.

## Promotion Criteria

An e2e spec that walks all three tabs, asserts `aria-selected`/`data-state`, toggles the switch, and asserts the Today status. Needs a seeded log for the History rows.
