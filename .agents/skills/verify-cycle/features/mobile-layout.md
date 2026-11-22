# Mobile layout

## Status

deterministic

## Sub-features

- On a phone-sized screen the three sections live in a bar pinned to the bottom edge.
- The bar clears the home-indicator inset, and the page leaves room for it so nothing hides under it.
- Each tab is at least 44 by 44 CSS pixels.
- Every visible text button (`Prev`, `Next`, `What the marks mean`, etc.) is at least 44px tall, except the edit card's compact `Save`/`Cancel` controls (36px tall, >44px wide).
- The switch keeps its small track but expands the hit area with a transparent box.
- A quick swipe over the calendar still scrolls; a 250ms hold on a read-only day opens the edit mode there, and inside edit mode the same hold turns the gesture into a range paint.
- The layout never scrolls sideways at 390px.
- Tapping a tab in the bar switches the panel.

## How to get to it (user POV)

Open the app on a phone. Today, History and About are at the bottom, under the thumb, rather than under the heading. A wide window keeps that bar and only stops widening the column.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs mobile
```

The flow calls `browser.viewport({ width: 390, height: 844, mobile: true })`, which sends `Emulation.setDeviceMetricsOverride` plus touch emulation. It then reads the bar's bounding box, the tab boxes, `document.documentElement.scrollWidth` and the page's computed bottom padding. It also measures every visible text button and runs a quick `Input.dispatchTouchEvent` swipe to prove the read-only calendar does not swallow scrolling, then opens `Log a day`, holds and drags, asserts the draft count, and saves.

## Gotchas

- Chrome's headless default is 1280x800. The app has one layout now, but the flow still sets the phone viewport so the touch emulation and the 390px assertions are honest.
- `mobile: true` is what makes `<meta name="viewport">` apply, so CSS pixels match the device width. Emulating a width without it lays the page out at 980px.
- The bar is `position: fixed`, so it is not in the document flow: assert on `getBoundingClientRect().bottom` against `window.innerHeight`, not on document order.
- `env(safe-area-inset-bottom)` is 0 in Chrome, so the flow proves the padding exists, not that a notch is respected. A real iOS device is the only way to see that.
- The 390x844 screen fits the whole Today panel, so the scroll check shrinks the viewport to 390x600 first. A quick swipe must move `window.scrollY`; inside `Log a day`, a hold then drag must paint the draft.
- Reset the viewport at the end of the flow; a later flow inherits the emulated size.

## Promotion Criteria

An e2e spec at two viewports: a phone (390x844) and a desktop (1280x800). Assert the bar is fixed at the bottom at both sizes, every tab and text button is at least 44px, and the page has no horizontal overflow. Add a touch swipe that scrolls in read-only mode and a touch hold-and-drag that paints a draft inside `Log a day`.
