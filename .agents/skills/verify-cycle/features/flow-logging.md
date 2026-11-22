# Logging flow

## Status

deterministic

## Sub-features

- The calendar is read-only by default: a tap on a day does nothing and writes nothing. A hold opens the edit mode on the held day without writing it.
- Holding a day opens the edit mode on that day. A tap then paints a day into the draft and the title turns to `Unsaved changes`. There is no button for the mode; the hold is the only way in, and the hint under the calendar says so.
- `Save` writes the draft to `cycle.logs` and closes the mode; `Cancel` discards it and nothing is written.
- Reloading keeps a saved day; an unsaved draft is gone.
- Dragging across days paints a span into the draft. A mouse or pen drags at once; touch holds a day for 250ms first, so a fast swipe still scrolls. A press boxes the day at once, whatever the pointer. Every day in the live span is boxed, the hold fires a `heavy` haptic, and crossing a day fires a `selection` detent.
- Every day is a toggle. A tap flips one day; a drag flips each day it covers. A day that carries the pen leaves the draft, a day with the other flow is repainted, and a day that does not carry it takes the pen. A drag recomputes from the draft as it was when the drag began, so moving the far end back and forth never stacks flips.

## How to get to it (user POV)

Open the app. The calendar is read-only, and the card above it says to hold a day. Press and hold a day, then tap today's cell (or any past day). `Save` lights up and the calendar boxes the day; `localStorage` is still untouched. Pick `Bleeding` or `Spotting` at any point; that is the pen. Tap more days, or hold and drag a run. `Save` writes them and the marks stay. Reload; they are still there. Hold a day, tap it to toggle it off, and `Save` to undo it.

Catching up on a forgotten period: hold the first day, drag to the last, release, `Save`. The calendar marks every day in the span before it is written. With a mouse or pen, press at one end and drag to the other. On a phone, hold a day for a moment and drag.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs flow
```

The flow first taps today's cell with no mode and asserts the editor stays absent and storage stays empty. It holds the cell to open the mode, paints today's cell, and asserts `[data-slot="edit-banner"][data-state="dirty"]` (the app's own attribute) plus `data-draft-days` while `localStorage` is still empty. It then `Save`s, reads `localStorage`, reloads, and repeats. Clearing is hold -> tap the logged day -> `Save`. The drag step seeds an empty log, opens the mode, drags between two cells four days apart with `Input.dispatchMouseEvent` in steps, and asserts the draft count before saving; it then taps the painted today cell and asserts the draft drops to three before `Save` keeps it out of storage. The `mobile` flow first holds a day while read-only and asserts the edit banner appears on that day with a clean draft, then `Cancel`s back to read-only. It presses again with `Input.dispatchTouchEvent`, asserts the day is boxed after 80ms (before the hold), waits for the hold, asserts it is still boxed, then drags, asserts `data-draft-days`, and saves.

## Gotchas

- The calendar is read-only until a day is held; a bare tap is deliberately inert. There is no `Log a day` button.
- The mode banner is `[data-slot="edit-banner"]`. `data-state` is `dirty`/`clean`, and `data-draft-days` is the draft length. `Save` is disabled while the draft equals the saved logs.
- Haptics come from `web-haptics`; never assert them, and never rely on them. iOS 26.5+ is silent.
- A touch drag starts only after a 250ms hold. A faster move cancels the drag and lets the page scroll. The scroll blocker is a non-passive `touchmove` registered at mount, because iOS ignores one added after the touch began. A press boxes the day at once; the hold fires a `heavy` haptic; each new day fires a selection detent.
- A mouse drag needs intermediate `pointerenter` events; drive it with several `Input.dispatchMouseEvent` moves, not one jump. A touch drag needs `Input.dispatchTouchEvent` moves after the hold.
- Painting a day writes only the draft; `Save` is the only action that touches `cycle.logs`. `Cancel` and a reload throw the draft away.
- `cycle.logs` is an array of `{ date, flow }`. The app sorts it; do not assert insertion order across runs.
- The drive starts a fresh Chrome profile, so `localStorage` begins empty. Do not point it at your normal browser profile.
- Prediction can be switched off on the About tab. Nothing on Today depends on the switch today, so the app must simply keep working with it off.

## Promotion Criteria

An e2e spec that opens `Log a day`, paints a day, asserts the draft and that storage is untouched, saves, asserts the stored JSON, reloads, asserts persistence, then clears through the mode. A second spec arms a range, taps the far end, asserts `data-draft-days`, saves, and asserts one write per day; it also taps a painted day and asserts the draft drops instead of growing. A third drags with a mouse and asserts the same, then drags from a clear day across a painted run and asserts each day flips. A fourth does the same over touch emulation after a hold. A fifth asserts a bare tap on the read-only calendar writes nothing and that a hold opens the mode without writing. Needs a clean `localStorage` per test (a browser context or `page.addInitScript`), and a fixed clock if the date matters.
