import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

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
    position: 'absolute',
    top: '100%',
    insetInlineStart: 0,
    zIndex: 30,
    marginTop: space.sm,
    maxWidth: '32ch',
    padding: `${space.sm} ${space.md}`,
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

export type TooltipProps<Message> = {
  readonly id: string
  readonly label: string
  readonly content: string
  readonly isVisible: boolean
  readonly onShow: Message
  readonly onHide: Message
}

export const view = <Message>(
  props: TooltipProps<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Attribute('class', stylex.attrs(styles.wrapper).class ?? '')],
    [
      h.button(
        [
          h.Type('button'),
          h.Attribute('class', stylex.attrs(styles.trigger).class ?? ''),
          h.AriaDescribedBy(props.isVisible ? props.id : ''),
          h.OnMouseEnter(props.onShow),
          h.OnMouseLeave(props.onHide),
          h.OnFocus(props.onShow),
          h.OnBlur(props.onHide),
          h.OnKeyDownPreventDefault(key =>
            key === 'Escape' ? Option.some(props.onHide) : Option.none(),
          ),
        ],
        [props.label],
      ),
      props.isVisible
        ? h.span(
            [
              h.Role('tooltip'),
              h.Id(props.id),
              h.Attribute('class', stylex.attrs(styles.bubble).class ?? ''),
            ],
            [props.content],
          )
        : h.empty,
    ],
  )
