# Mobile layout

## Status

deterministic

## Sub-features

- On a phone-sized screen the three sections live in a bar pinned to the bottom edge.
- The bar clears the home-indicator inset, and the page leaves room for it so nothing hides under it.
- Each tab is at least 44 by 44 CSS pixels.
- The layout never scrolls sideways at 390px.
- Tapping a tab in the bar switches the panel.

## How to get to it (user POV)

Open the app on a phone. Today, History and About are at the bottom, under the thumb, rather than under the heading. On a window wider than 48rem the same three words move back to the top of the column.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs mobile
```

The flow calls `browser.viewport({ width: 390, height: 844, mobile: true })`, which sends `Emulation.setDeviceMetricsOverride` plus touch emulation. It then reads the bar's bounding box, the tab boxes, `document.documentElement.scrollWidth` and the page's computed bottom padding.

## Gotchas

- Chrome's headless default is 1280x800, which takes the desktop branch of the `48rem` media query. Without the viewport override the flow would pass with the bar in the wrong place.
- `mobile: true` is what makes `<meta name="viewport">` apply, so CSS pixels match the device width. Emulating a width without it lays the page out at 980px.
- The bar is `position: fixed`, so it is not in the document flow: assert on `getBoundingClientRect().bottom` against `window.innerHeight`, not on document order.
- `env(safe-area-inset-bottom)` is 0 in Chrome, so the flow proves the padding exists, not that a notch is respected. A real iOS device is the only way to see that.
- Reset the viewport at the end of the flow; a later flow inherits the emulated size.

## Promotion Criteria

An e2e spec at two viewports: a phone (390x844) and a desktop (1280x800). Assert the bar is fixed and at the bottom on the phone, static and above the panel on the desktop, every tab is at least 44px, and the page has no horizontal overflow at either size.
