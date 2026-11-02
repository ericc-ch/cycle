import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/popover'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/popover'

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
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 20,
  },
  panel: {
    zIndex: 21,
    width: 'min(24rem, calc(100vw - 2rem))',
    padding: space.md,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.line,
    backgroundColor: palette.bg0,
    color: palette.fg0,
    fontFamily: font.sans,
    fontSize: typeScale.sm,
    lineHeight: 1.5,
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
})

export type RenderConfig = Readonly<{
  label: string
  children: Html
}>

/** An underlined trigger with a panel anchored below it. */
export const render = <Message>(
  info: RenderInfo,
  config: RenderConfig,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Attribute('class', stylex.attrs(styles.wrapper).class ?? '')],
    [
      h.button(
        [
          ...info.button,
          h.Attribute('class', stylex.attrs(styles.trigger).class ?? ''),
        ],
        [config.label],
      ),
      ...(info.isVisible
        ? [
            h.div([
              ...info.backdrop,
              h.Attribute('class', stylex.attrs(styles.scrim).class ?? ''),
            ]),
            h.div(
              [
                ...info.panel,
                h.Attribute('class', stylex.attrs(styles.panel).class ?? ''),
              ],
              [config.children],
            ),
          ]
        : []),
    ],
  )
