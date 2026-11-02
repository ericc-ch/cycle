# @cycle/ui

Styled Foldkit components for `cycle`, in the shape shadcn uses: the components live here, the app composes them, and the styles come from this package rather than from call sites.

Styling is StyleX. Values come from `src/tokens.stylex.js`, which maps the design tokens in `apps/web/src/theme.css` (the `light-dark()` pairs) into StyleX variables. A component never hard-codes a colour or a font.

## What is here

| Component     | Semantics                             | Keyboard                                               |
| ------------- | ------------------------------------- | ------------------------------------------------------ |
| `Button`      | native `button`, variants             | Enter, Space                                           |
| `ToggleGroup` | `radiogroup` + `radio`                | arrows move and select, Home/End, roving tabindex      |
| `Tabs`        | `tablist` + `tab` + `tabpanel`        | arrows move and select, Home/End, roving tabindex      |
| `Switch`      | `switch` with `aria-checked`          | Enter, Space                                           |
| `Tooltip`     | `role="tooltip"` + `aria-describedby` | shows on hover and focus, Escape hides                 |
| `Popover`     | `aria-expanded`/`aria-controls`       | Escape closes, outside click closes, focus moves in    |
| `Menu`        | `menu` + `menuitem`                   | arrows, Home/End, Enter/Space select, Escape/Tab close |
| `Dialog`      | `role="dialog"`, `aria-modal`         | Escape closes, scrim click closes, focus moves in      |

Every component is a plain function: `view(props, h) => Html`. There is no submodel, no state machine and no hidden state. The app owns the open/closed flag, the selected index and the message to dispatch, which keeps the whole interaction testable from `story` and `scene` tests.

## Provenance

The components were written for this repo. What was taken from elsewhere is the **behaviour contract**: the ARIA roles, the keyboard model, where focus goes, and what a screen reader announces. That contract follows:

- [React Aria](https://react-spectrum.adobe.com/react-aria/) — Apache-2.0
- [Base UI](https://base-ui.com/) — MIT
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) — W3C

No React source was copied, so neither licence is triggered by this code. The notices are kept in [`NOTICE`](./NOTICE) because the components are adaptations of those designs, and because a future change may well copy a snippet.

## Deliberate gaps

These are known and not bugs:

- **Dialog has no focus trap.** Tab can leave the dialog. Closing returns focus to the browser's choice, not to the trigger.
- **Menu has no typeahead.** Arrows, Home and End only.
- **Popover and Menu position themselves with CSS.** `align: 'start' | 'end'` picks a side; there is no collision detection against the viewport.
- **Nothing is portalled.** Overlays render where the component sits in the tree, which is fine for this app's single column.
- **Tooltip has no delay.** It opens on `mouseenter` and `focus` immediately.

## Writing a component

Three rules that StyleX enforces, learned the hard way:

1. Shared style values must live in `src/tokens.stylex.js`, and the import specifier must end in `.stylex.js`. `import { palette } from '@cycle/ui'` is rejected with `Could not resolve the path to the imported file`; `import { palette } from '@cycle/ui/src/tokens.stylex.js'` works. That is why `index.ts` does not re-export the tokens.
2. A file that only exports constants is not transformed, so those constants have to come from `stylex.defineVars` (or `defineConsts`) for StyleX to inline them.
3. A bare imported scalar (`import { lineHeight }`) fails with `A style value can only contain an array, string or number`. Member access on an imported object (`palette.fg0`) and inline literals both work, so scalars are written inline and shared values live in a vars group.

Spacing tokens include their unit (`'8px'`), because `defineVars` values are strings and `${space.sm}px` would emit `var(--x…)px`.
