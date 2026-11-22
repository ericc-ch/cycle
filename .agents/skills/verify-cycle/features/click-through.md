# Click-through

## Status

deterministic

## Sub-features

- Every visible control receives the pointer at its own center: the three tabs, each day cell, each flow option.
- No dialog content is mounted while every dialog is closed.
- Opening and closing a dialog restores clickability.

## How to get to it (user POV)

Load the app. Tap a tab, a day, `Log a day`. Nothing should feel dead. The flow options are only mounted inside the mode, so the check opens it first. This is the path that failed when a closed overlay stayed mounted with a full-page area: an invisible sheet sat on top of the page and took every click. The app now mounts dialog content only while it is open, so the at-rest check is that no dialog content exists.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs clicks
```

The flow opens `Log a day`, then calls `document.elementFromPoint` at the center of every control and fails if the hit is not the control or a descendant. It then asserts that no `[data-slot="dialog-content"]` or `[data-slot="dialog-overlay"]` is mounted.

## Gotchas

- A pointer-events: none overlay is invisible to elementFromPoint, so this check does not catch non-interactive covers.
- The dev server binds 127.0.0.1 only. Use http://127.0.0.1:5273/; localhost can resolve to ::1 and refuse.
- An open dialog is expected to cover the page. The check only inspects the closed state.

## Promotion Criteria

A native e2e spec that, after each overlay closes, asserts `document.elementFromPoint` on the tabs returns a tab, and that no dialog content or overlay is mounted. Needs a browser runner and the same isolated port; no data setup.
