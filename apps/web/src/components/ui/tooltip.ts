import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/tooltip'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/tooltip'

const styles = stylex.create({
  root: {
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
  content: {
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

/** The dotted-underline trigger. */
export const trigger = <Message>(
  info: RenderInfo,
  label: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      ...info.trigger,
      h.DataAttribute('slot', 'tooltip-trigger'),
      h.Attribute('class', stylex.attrs(styles.trigger).class ?? ''),
    ],
    [label],
  )

/** The anchored panel. Empty while hidden. */
export const content = <Message>(
  info: RenderInfo,
  text: string,
  h: HtmlBuilder<Message>,
): Html =>
  info.isVisible
    ? h.div(
        [
          ...info.panel,
          h.DataAttribute('slot', 'tooltip-content'),
          h.Attribute('class', stylex.attrs(styles.content).class ?? ''),
        ],
        [text],
      )
    : h.empty

export type RenderConfig = Readonly<{
  label: string
  content: string
}>

/** The default composition: trigger and panel inside one inline wrapper. */
export const render = <Message>(
  info: RenderInfo,
  config: RenderConfig,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Attribute('class', stylex.attrs(styles.root).class ?? '')],
    [trigger(info, config.label, h), content(info, config.content, h)],
  )
