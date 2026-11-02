# Click-through

## Status

deterministic

## Sub-features

- Every visible control receives the pointer at its own center: Data menu, the three tabs, each day cell, each flow option, the legend trigger, the confidence trigger.
- Closed dialogs are `display: none` with a zero area.
- Opening and closing a dialog restores clickability.

## How to get to it (user POV)

Load the app. Tap a tab, a day, a flow option, Data. Nothing should feel dead. This is the path that failed when closed `<dialog>` elements were rendered with `display: grid`: the UA rule hides a closed dialog, but any author `display` overrides it, and the component's inline `width/height: 100%` turned each one into a full-screen sheet. The second dialog sat on top of the page.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs clicks
```

The flow calls `document.elementFromPoint` at the center of every control and fails if the hit is not the control or a descendant. It then reads every closed dialog's computed `display` and `getBoundingClientRect`.

## Gotchas

- `elementFromPoint` returns the topmost element; a `pointer-events: none` overlay is invisible to it, so this check does not catch non-interactive covers.
- The dev server binds `127.0.0.1` only. Use `http://127.0.0.1:5273/`; `localhost` can resolve to `::1` and refuse.
- An open `<dialog>` is expected to cover the page. The check only inspects closed ones.

## Promotion Criteria

A native e2e spec that, after each overlay closes, asserts `document.elementFromPoint` on the tabs returns a tab, and that `getComputedStyle(dialog).display === 'none'` for all closed dialogs. Needs a browser runner and the same isolated port; no data setup.
