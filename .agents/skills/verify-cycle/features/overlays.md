# Overlays

## Status

deterministic

## Sub-features

- About opens the explainer dialog, titled `How the range is calculated`.
- Escape closes the dialog and the page is clickable again.
- About opens the clear dialog, titled `Clear all data?`, and Escape backs out without deleting anything.
- The legend popover opens from `What the marks mean`, explains the ink levels, and closes.

## How to get to it (user POV)

The `About` tab (`/about`) holds both dialogs (`How the range is calculated` and `Clear all data`) and the legend popover (`What the marks mean`).

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs overlays
```

Selectors: `[data-slot="tabs-trigger"]` (to reach About), `[data-slot="button"]` by text, `[data-slot="dialog-title"]`, `[data-slot="popover-trigger"]`, `[data-slot="popover-content"]`. Input is `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent`, so pointerdown and Escape are real events.

## Gotchas

- Both dialogs live in the About panel's markup, so the flow has to switch tabs before clicking a trigger. Switching back to Today unmounts them, which is fine: they are closed by then.
- React Aria renders the dialog in a portal only while it is open. Assert on `[data-slot="dialog-content"]`, not on a native `<dialog>` element.
- React Aria handles Escape while the dialog is open; there is no app-level key handler to look for.
- Closed dialog content is unmounted. The doctor and the `clicks` flow assert that no dialog content exists at rest.
- The legend closes on a click, so a second click re-opens it. Read `[data-slot="popover-content"]` to tell which happened.
- The popover panel is portalled. Scope by `data-slot`, not by DOM ancestry.
- If Escape does not close the popover (focus can be outside the panel), the flow falls back to clicking the trigger. Treat a fallback as a warning, not a pass.

## Promotion Criteria

An e2e spec for each overlay: open, assert content and role, close with Escape and with the backdrop, then assert the trigger is clickable again. Needs the app booted on an isolated port and no seeded data.
