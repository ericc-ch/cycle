# components/ui

Styled Foldkit components, copied into the app the way shadcn does it: the code lives here, the app owns it, and there is no package to publish or upgrade.

`@foldkit/ui` owns the behaviour: ARIA roles, keyboard navigation, focus management, and the submodel state for Tabs, RadioGroup, Menu, Popover, Tooltip and Dialog. These files only own the markup and the styles, supplied through each component's `toView` hook.

That split is why nothing here holds a flag. The app stores each submodel in its own Model and drives it with `h.submodel` and `Update.foldChild`.

## What is here

Each module re-exports the headless module it wraps, so the app imports state and rendering from one place:

| Module        | Styled export                       | Wraps                    |
| ------------- | ----------------------------------- | ------------------------ |
| `button`      | `Button.render`                     | `@foldkit/ui/button`     |
| `switch`      | `Switch.render`                     | `@foldkit/ui/switch`     |
| `tabs`        | `Tabs.render(info, panel, h)`       | `@foldkit/ui/tabs`       |
| `radio-group` | `RadioGroup.render(info, label, h)` | `@foldkit/ui/radioGroup` |
| `tooltip`     | `Tooltip.render(info, config, h)`   | `@foldkit/ui/tooltip`    |
| `popover`     | `Popover.render(info, config, h)`   | `@foldkit/ui/popover`    |
| `dialog`      | `Dialog.render(info, config, h)`    | `@foldkit/ui/dialog`     |
| `menu`        | `Menu.renderConfig(config, h)`      | `@foldkit/ui/menu`       |

The `render` functions take the `RenderInfo` the library publishes and return the element tree. The app passes them in as `viewInputs.toView` (Tabs, RadioGroup, Tooltip, Popover, Dialog) or as the class names in the Menu's view inputs.

`src/tokens.stylex.js` maps the design tokens in `src/theme.css` into StyleX variables. A component never hard-codes a colour, font or spacing value.

## Adding a component

1. Import the headless module and re-export it, so one import gives the app both state and rendering.
2. Write `render` (or `renderConfig`) against the library's `RenderInfo`; do not rebuild the ARIA attributes or the event handlers.
3. Keep the styling here. The app composes components and never restyles them; app-level layout lives in `src/main.ts`.

## StyleX rules

Three rules that StyleX enforces, learned the hard way:

1. Shared style values must live in `src/tokens.stylex.js`, and the import specifier must end in `.stylex.js`. Importing the tokens through this barrel is rejected with `Could not resolve the path to the imported file`. That is why `index.ts` does not re-export them.
2. A file that only exports constants is not transformed, so those constants have to come from `stylex.defineVars` (or `defineConsts`) for StyleX to inline them.
3. A bare imported scalar (`import { lineHeight }`) fails with `A style value can only contain an array, string or number`. Member access on an imported object (`palette.fg0`) and inline literals both work, so scalars are written inline and shared values live in a vars group.

Spacing tokens include their unit (`'8px'`), because `defineVars` values are strings and `${space.sm}px` would emit `var(--x…)px`.
