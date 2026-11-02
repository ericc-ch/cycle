import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/popover'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/popover'

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
  content: {
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

/** The trigger button. */
export const trigger = <Message>(
  info: RenderInfo,
  label: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      ...info.button,
      h.DataAttribute('slot', 'popover-trigger'),
      h.Attribute('class', stylex.attrs(styles.trigger).class ?? ''),
    ],
    [label],
  )

/** The scrim and the panel. Empty while closed. */
export const content = <Message>(
  info: RenderInfo,
  children: Html,
  h: HtmlBuilder<Message>,
): Html =>
  info.isVisible
    ? h.span(
        [],
        [
          h.div([
            ...info.backdrop,
            h.DataAttribute('slot', 'popover-backdrop'),
            h.Attribute('class', stylex.attrs(styles.backdrop).class ?? ''),
          ]),
          h.div(
            [
              ...info.panel,
              h.DataAttribute('slot', 'popover-content'),
              h.Attribute('class', stylex.attrs(styles.content).class ?? ''),
            ],
            [children],
          ),
        ],
      )
    : h.empty

export type RenderConfig = Readonly<{
  label: string
  children: Html
}>

/** The default composition: a positioned trigger followed by its content. */
export const render = <Message>(
  info: RenderInfo,
  config: RenderConfig,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Attribute('class', stylex.attrs(styles.root).class ?? '')],
    [trigger(info, config.label, h), content(info, config.children, h)],
  )
