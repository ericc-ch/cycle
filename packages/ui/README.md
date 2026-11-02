# @cycle/ui

The styled layer over [`@foldkit/ui`](https://foldkit.dev/ui/overview), plus the StyleX design tokens.

`@foldkit/ui` owns the behaviour: ARIA roles, keyboard navigation, focus management, and the submodel state for Tabs, RadioGroup, Menu, Popover, Tooltip and Dialog. This package owns the markup and the styles, supplied through each component's `toView` hook.

That split is the reason there is no state here. The app stores each submodel in its own Model and drives it with `h.submodel` and `Update.foldChild`. Nothing in this package holds a flag.

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

`src/tokens.stylex.js` maps the design tokens in `apps/web/src/theme.css` into StyleX variables. A component never hard-codes a colour, font or spacing value.

## The one-instance rule

`@foldkit/ui` must see the same `foldkit` copy as the app, or its brand checks fail at render time with `foldkit was loaded as more than one instance`. Workspaces here have their own `node_modules`, so both `apps/web/vite.config.ts` and `vitest.config.ts` set:

```ts
resolve: {
  dedupe: ['foldkit', '@foldkit/ui', 'effect']
}
```

Keep that in place when adding a workspace dependency that imports Foldkit.

## Writing a renderer

Three rules that StyleX enforces, learned the hard way:

1. Shared style values must live in `src/tokens.stylex.js`, and the import specifier must end in `.stylex.js`. `import { palette } from '@cycle/ui'` is rejected with `Could not resolve the path to the imported file`; `import { palette } from '@cycle/ui/src/tokens.stylex.js'` works. That is why `index.ts` does not re-export the tokens.
2. A file that only exports constants is not transformed, so those constants have to come from `stylex.defineVars` (or `defineConsts`) for StyleX to inline them.
3. A bare imported scalar (`import { lineHeight }`) fails with `A style value can only contain an array, string or number`. Member access on an imported object (`palette.fg0`) and inline literals both work, so scalars are written inline and shared values live in a vars group.

Spacing tokens include their unit (`'8px'`), because `defineVars` values are strings and `${space.sm}px` would emit `var(--x…)px`.
