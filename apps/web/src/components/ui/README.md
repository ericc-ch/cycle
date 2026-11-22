# components/ui

shadcn-style components, copied into the app the way shadcn copies its own: the code lives here, the app owns it, and there is no package to publish or upgrade.

[React Aria](https://react-spectrum.adobe.com/react-aria/) owns the behaviour: ARIA roles, keyboard navigation, focus management, the modal overlay and open/closed state for Tabs, Dialog, AlertDialog, RadioGroup, Switch, Popover and Calendar. These files own the markup and the Tailwind classes. The calendar markup is React Aria's `Calendar`; everything except the press-and-drag paint and the flow marks is theirs.

The structure follows shadcn's component names: named parts, `variant`/`size` props, and `data-slot` markers. The comparison is against shadcn's `aria-nova` style; `npx shadcn@latest view <name> -c apps/web` prints the current registry item when re-checking a part name. React Aria renamed some props (`isSelected`, `onChange`, `selectedKey`, `onSelectionChange`, `isOpen`); these files keep React Aria's names rather than translating.

## Which base

The base is `aria-nova`, because React Aria is the only one of shadcn's three primitive libraries with a calendar that speaks `CalendarDate`, a day with no time and no zone. Base UI ships no calendar, and shadcn's Radix calendar is `react-day-picker`, which works in local JS `Date` and brings the off-by-one days back.

Size was not the reason. Bundled alone, minified, React external, the six dialog-ish primitives (dialog, alert dialog, popover, radio group, switch, tabs) came to 104 kB on Radix, 160 kB on Base UI and 165 kB on React Aria; migrating the rest either way would have cost more than the difference.

## Parts

| shadcn                                                                                                                                                 | Here                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                                                                               | `Button`; React Aria's `Button`, so `onPress` and `slot` work                                              |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`                                                                                                    | same names; React Aria's `id`/`selectedKey` props                                                          |
| `RadioGroup` / `RadioGroupItem`                                                                                                                        | same names                                                                                                 |
| `Switch`                                                                                                                                               | `Switch`; the thumb is rendered inside, the label is app markup                                            |
| `Popover` / `PopoverTrigger` / `PopoverContent`                                                                                                        | same names; the trigger is a `Button` inside React Aria's `DialogTrigger`                                  |
| `Dialog` / `DialogContent` / `DialogTitle` / `DialogDescription` / `DialogFooter` / `DialogClose`                                                      | same names; `Dialog` is the `ModalOverlay`, `DialogClose` closes through `slot="close"`                    |
| `AlertDialog` / `AlertDialogContent` / `AlertDialogTitle` / `AlertDialogDescription` / `AlertDialogFooter` / `AlertDialogAction` / `AlertDialogCancel` | same names; `role="alertdialog"`, no outside dismissal; `Action` and `Cancel` close through `slot="close"` |
| `Calendar`                                                                                                                                             | `Calendar`; React Aria's `Calendar` plus the paint gesture and a `decoration` for the flow mark            |

`data-slot` values match shadcn's part names. The calendar adds `calendar`, `calendar-previous-month`, `calendar-next-month`, `calendar-heading`, `calendar-grid` and `calendar-day`; the browser check drives it through those and through each day's `data-date`.

The calendar's `onRangeSelect` paints the span into the app's draft: a mouse or pen starts at once; touch holds for 250ms first so a fast swipe still scrolls, then follows the finger. `onRangeEnd` tells the app the drag was released. The pen is the draft's flow, and every day flips on its own: one that carries the pen leaves, one that does not takes it, and one with the other flow is repainted. A drag flips each day in its span against the draft as it was when the drag began, so moving the far end recomputes and never stacks. A press boxes the day at once, whatever the pointer, so a hold looks like something before it does anything. While the range is live, every day in it is boxed (`border-fg-0`), not just the two ends. The hold fires a `heavy` haptic; crossing a day fires a `selection` detent. The scroll blocker is a non-passive `touchmove` registered at mount, because iOS ignores one added after the touch began. `readOnly` makes taps and drags no-ops, which is the default outside the app's edit mode.

Two of those behaviours are React Aria's blind spot, and they are ordinary transitions in the machine rather than flags: a press that began read-only ends a mode change on its lift and never toggles the day, and a press that moved ends a range instead of toggling the day it started on. The machine itself is `src/gesture.ts`: it takes `Pressed`, `Held`, `Moved`, `Lifted` and `Cancelled`, and returns the next state plus the effects to run (`HoldTimer`, `DropHoldTimer`, `Haptic`, `OpenEditing`, `ToggleDay`, `PaintSpan`, `EndRange`). The component only translates DOM events into those and performs the effects.

Haptics are named presets from `web-haptics` in `src/haptics.ts`. Never call `navigator.vibrate` directly.

Dialog and popover content is mounted only while open. That is why the browser check asserts that no `[data-slot="dialog-content"]` or `[data-slot="dialog-overlay"]` exists at rest, rather than reading a closed element.

## Mobile first

Base classes are the phone and the only classes. `TabsList` is three equal cells filling the bottom bar at every width; `RadioGroupItem` is always 44px tall. The bar's fixed position, background and safe-area padding are page layout, so they live in `src/app.tsx`, not here.

## Where this deliberately differs

The design is monochrome and typographic (`https://ericc.ch/DESIGN.md`): "Links and buttons are one thing: an underline that firms up on hover, no backgrounds, no pills, no arrows, no primary button." A faithful copy of shadcn's visual variants would contradict that, so:

- **Button variants.** Only `link` (default) and `ghost` (muted ink) ship. `default`, `outline`, `secondary` and `destructive` all need a filled or bordered surface, so they are absent rather than silently mapped to something they are not.
- **Button sizes.** `sm`, `default`, `lg` and `icon` ship; they change type size and padding, not a fixed height. Every button is `self-start` so a link in a flex column does not stretch to the full width.
- **`TabsList`.** The underline is the only tab treatment here; shadcn's pill list needs a muted fill.
- **No trigger for the app dialogs.** The app owns `isOpen` in its reducer and passes it to `Dialog`; opening is an action, not hidden component state.
- **No built-in close icon.** The dialogs put a text `Close` in `DialogFooter`, where the design wants a text control.
- **The clear-data confirm is an `AlertDialog`.** `role="alertdialog"`, no outside-click dismiss, focus inside. It is the one place a tap away must not answer the question.
- **Overlay and focus.** Both are React Aria's; do not reimplement them in a wrapper.

## Styling

All design values come from `apps/web/src/styles.css`. Its `@theme` block holds the monochrome tokens and the type/spacing ladder from `https://ericc.ch/r/tokens-theme.json`; `@theme inline` aliases shadcn's names (`background`, `foreground`, `muted-foreground`, `border`, `ring`) onto those tokens. Tailwind utilities are written in the component that owns the element.

The design rules themselves are in `AGENTS.md`. What a component author needs on top: focus is a 2px `outline-fg-0` outline with a 2px offset, muted text is `text-fg-1`, hairlines are `border-line`.

`cn` (`src/lib/utils.ts`) merges conditional classes. It is `clsx` plus `tailwind-merge`, so a later `h-px` beats an earlier `h-0.5`.

## Adding a component

1. Copy the shadcn `aria-nova` source for the part names and `data-slot` values.
2. Use the React Aria primitive for behaviour; do not rebuild ARIA or event handling.
3. Rewrite the visual classes against the monochrome tokens; `AGENTS.md` lists the rules.
4. Export the parts from `index.ts`.
5. Add a test only for the contract the app relies on (`data-slot`, roles, the reducer state). React Aria keyboard and focus behaviour belongs to the browser check.
