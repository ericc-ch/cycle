import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/tooltip'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/tooltip'

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
    cursor: 'help',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationThickness: '1px',
    textUnderlineOffset: '0.2em',
    textDecorationColor: 'color-mix(in oklab, currentcolor 55%, transparent)',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  bubble: {
    zIndex: 30,
    maxWidth: '32ch',
    padding: space.sm,
    paddingInline: space.md,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.line,
    backgroundColor: palette.bg0,
    color: palette.fg1,
    fontFamily: font.sans,
    fontSize: typeScale.sm,
    lineHeight: 1.4,
  },
})

export type RenderConfig = Readonly<{
  label: string
  content: string
}>

/** A dotted-underline trigger with a short grey explanation anchored to it. */
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
          ...info.trigger,
          h.Attribute('class', stylex.attrs(styles.trigger).class ?? ''),
        ],
        [config.label],
      ),
      ...(info.isVisible
        ? [
            h.div(
              [
                ...info.panel,
                h.Attribute('class', stylex.attrs(styles.bubble).class ?? ''),
              ],
              [config.content],
            ),
          ]
        : []),
    ],
  )
