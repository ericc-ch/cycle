# Overlays

## Status

deterministic

## Sub-features

- Data menu opens with two items and closes on selection.
- `How this works` opens the explainer dialog, titled, above the page.
- Escape closes the dialog and the page is clickable again.
- The legend popover opens from `what the marks mean`, explains the ink levels, and closes.
- Hovering the confidence word shows the tooltip after the 500 ms delay; moving away hides it.

## How to get to it (user POV)

The `Data` word in the masthead, the legend link under the day editor, and the dotted-underlined confidence word in the status line.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs overlays
```

Selectors: `[data-slot="dropdown-menu-trigger"]`, `[role="menuitem"]`, `[data-slot="dialog-title"]`, `[data-slot="popover-trigger"]`, `[data-slot="popover-content"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="tooltip-content"]`. Input is `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent`, so pointerdown and Escape are real events.

## Gotchas

- The menu opens on **pointerdown** with a mouse, not click. `element.click()` does not open it; the harness dispatches press and release.
- The dialog is a native `<dialog open>`. Escape is handled by the component's global handler from `Dom.showDialog`, which is why an ordinary `keydown` listener in the test does nothing.
- The dialog element exists even while closed. Assert on `dialog[open]`, not on the presence of `<dialog>`.
- The tooltip waits `showDelay` (500 ms). Poll for up to 4 s instead of sleeping a fixed 500 ms.
- The popover panel is portalled. Scope by `data-slot`, not by DOM ancestry.
- If Escape does not close the popover (focus can be outside the panel), the flow falls back to clicking the trigger. Treat a fallback as a warning, not a pass.

## Promotion Criteria

An e2e spec for each overlay: open, assert content and role, close with Escape and with the backdrop, then assert the trigger is clickable again. Needs the app booted on an isolated port and no seeded data (tooltip only shows in the predicted state).
