import type { HtmlBuilder } from 'foldkit/html'

import type { ViewInputs } from '@foldkit/ui/menu'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/menu'

const styles = stylex.create({
  wrapper: {
    position: 'relative',
    display: 'inline-block',
  },
  trigger: {
    fontFamily: font.sans,
    fontSize: 'inherit',
    color: 'inherit',
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    cursor: 'pointer',
    textDecorationLine: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '0.18em',
    textDecorationColor: 'color-mix(in oklab, currentcolor 40%, transparent)',
    ':hover': { textDecorationColor: 'currentcolor' },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 20,
  },
  items: {
    zIndex: 21,
    minWidth: '14rem',
    paddingBlock: space.xs,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.line,
    backgroundColor: palette.bg0,
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  item: {
    display: 'block',
    width: '100%',
    textAlign: 'start',
    fontFamily: font.sans,
    fontSize: typeScale.sm,
    color: palette.fg0,
    backgroundColor: 'transparent',
    padding: space.sm,
    paddingInline: space.md,
    cursor: 'pointer',
    ':hover': { backgroundColor: palette.bg1 },
  },
  active: {
    backgroundColor: palette.bg1,
  },
})

export type RenderConfig<Item extends string> = Readonly<{
  items: ReadonlyArray<Item>
  label: (item: Item) => string
  trigger: string
  align?: 'start' | 'end'
}>

/** Builds the headless view inputs for a text menu that hangs off its
 *  trigger, aligned to the inline end of the column by default. */
export const renderConfig = <Item extends string, Message>(
  config: RenderConfig<Item>,
  h: HtmlBuilder<Message>,
): ViewInputs<Item> => ({
  items: config.items,
  itemToConfig: (item, context) => ({
    className:
      stylex.attrs(styles.item, context.isActive && styles.active).class ?? '',
    content: h.span([], [config.label(item)]),
  }),
  buttonContent: h.span([], [config.trigger]),
  buttonClassName: stylex.attrs(styles.trigger).class ?? '',
  itemsClassName: stylex.attrs(styles.items).class ?? '',
  backdropClassName: stylex.attrs(styles.backdrop).class ?? '',
  className: stylex.attrs(styles.wrapper).class ?? '',
  anchor: {
    placement: config.align === 'start' ? 'bottom-start' : 'bottom-end',
    gap: 4,
    padding: 8,
  },
})
