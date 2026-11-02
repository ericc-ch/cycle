# components/ui

Styled Foldkit components, copied into the app the way shadcn copies its components: the code lives here, the app owns it, and there is no package to publish or upgrade.

`@foldkit/ui` owns the behaviour: ARIA roles, keyboard navigation, focus management, and the submodel state for Tabs, RadioGroup, Menu, Popover, Tooltip and Dialog. These files own the markup and the styles, supplied through each component's `toView` hook.

The structure follows shadcn's component API where the two model concepts line up: named parts, `variant`/`size` props, `data-slot` / `data-state` / `data-variant` markers. The comparison is against the `new-york-v4` registry; pull `https://ui.shadcn.com/r/styles/new-york-v4/<name>.json` when re-checking a part name.

## Parts

| shadcn                                                                                                              | Here                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                                            | `Button.render`                                                                                                                                   |
| `Switch` / `SwitchThumb`                                                                                            | `Switch.render` (the thumb is internal)                                                                                                           |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`                                                                 | `Tabs.list` / `Tabs.trigger` / `Tabs.panel`, composed by the app                                                                                  |
| `RadioGroup` / `RadioGroupItem`                                                                                     | `RadioGroup.group` / `RadioGroup.item` (`RadioGroup.render` is `group`)                                                                           |
| `TooltipTrigger` / `TooltipContent`                                                                                 | `Tooltip.trigger` / `Tooltip.content` (`Tooltip.render` composes both)                                                                            |
| `PopoverTrigger` / `PopoverContent`                                                                                 | `Popover.trigger` / `Popover.content` (`Popover.render` composes both)                                                                            |
| `Dialog` / `DialogOverlay` / `DialogContent` / `DialogTitle` / `DialogDescription` / `DialogFooter` / `DialogClose` | `Dialog.root` / `Dialog.content` / `Dialog.title` / `Dialog.description` / `Dialog.footer` / `Dialog.closeButton` (`Dialog.render` composes them) |
| `DropdownMenuTrigger` / `DropdownMenuContent` / `DropdownMenuItem`                                                  | `Menu.renderConfig` marks those parts with `data-slot`, because `@foldkit/ui`'s Menu owns its markup                                              |

`data-slot` values match shadcn's names (`button`, `tabs-list`, `tabs-trigger`, `tabs-content`, `dialog-content`, `dialog-overlay`, `dialog-title`, `dialog-description`, `dialog-footer`, `dialog-close`, `dropdown-menu-trigger`, `dropdown-menu-content`, `dropdown-menu-item`, `popover-trigger`, `popover-content`, `tooltip-trigger`, `tooltip-content`, `radio-group`, `radio-group-item`, `switch`, `switch-thumb`, `switch-label`). `data-state` / `data-variant` / `data-size` follow shadcn's conventions, and the scene tests assert a few of them so they cannot silently disappear.

A closed native `<dialog>` must stay `display: none`. The UA sheet hides it, but any author `display` overrides that, and the component's inline `width/height: 100%` then turns the closed element into a full-page sheet that swallows every click. `Dialog.root` applies its grid only while `isVisible`; do not put a `display` on the base dialog class. The `clicks` flow and the doctor check this.

## Where this deliberately differs

The design is monochrome and typographic. `docs/DESIGN.md` in the site repo says: "Links and buttons are one thing: an underline that firms up on hover, no backgrounds, no pills, no arrows, no primary button." A faithful copy of shadcn's visual variants would contradict that, so:

- **Button variants.** Only `link` (default) and `ghost` (muted ink) ship. `default`, `outline`, `secondary` and `destructive` all require a filled or bordered surface, so they are absent rather than silently mapped to something they are not. Add them, with real fills, when the design allows a filled button.
- **Button sizes.** `sm`, `default`, `lg` and `icon` ship; they change type size and padding, not a fixed height.
- **`asChild`.** There is no Radix `Slot`. Compose the element the component already renders, or pass a different `label`.
- **`TabsList variant="line"`.** The underline is the only tab treatment here; shadcn's pill list (`default`) needs a muted fill. The trigger follows the list, so no variant prop is exposed.
- **No `DialogTrigger` / `PopoverTrigger` as a stateful part.** Shadcn's triggers dispatch internally. Here opening is an app Message that folds `Dialog.open` or lets the Popover's own button handler run, so the dialog trigger is a plain `Button` in the app.
- **Portals and focus.** Both are `@foldkit/ui`'s behaviour; do not reimplement them in a renderer.

## Adding a component

1. Import the headless module and re-export it, so one import gives the app both state and rendering.
2. Write the parts against the library's `RenderInfo`; do not rebuild the ARIA attributes or the event handlers.
3. Copy shadcn's part names and `data-slot` values where they exist. If a name collides with an export from `@foldkit/ui` (for example `Dialog.close` is the stateful command), suffix the styled part (`closeButton`).
4. Keep the styling here. The app composes components and never restyles them; app-level layout lives in `src/main.ts`.

## StyleX rules

Three rules that StyleX enforces, learned the hard way:

1. Shared style values must live in `src/tokens.stylex.js`, and the import specifier must end in `.stylex.js`. Importing the tokens through this barrel is rejected with `Could not resolve the path to the imported file`. That is why `index.ts` does not re-export them.
2. A file that only exports constants is not transformed, so those constants have to come from `stylex.defineVars` (or `defineConsts`) for StyleX to inline them.
3. A bare imported scalar (`import { lineHeight }`) fails with `A style value can only contain an array, string or number`. Member access on an imported object (`palette.fg0`) and inline literals both work, so scalars are written inline and shared values live in a vars group.

Spacing tokens include their unit (`'8px'`), because `defineVars` values are strings and `${space.sm}px` would emit `var(--x…)px`.
