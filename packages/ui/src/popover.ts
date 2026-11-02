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
    position: 'absolute',
    top: '100%',
    zIndex: 21,
    width: 'min(24rem, calc(100vw - 2rem))',
    marginTop: space.sm,
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
  start: { insetInlineStart: 0 },
  end: { insetInlineEnd: 0 },
})

export type PopoverProps<Message> = {
  readonly id: string
  readonly label: string
  readonly isOpen: boolean
  readonly onToggle: Message
  readonly onClose: Message
  readonly children: ReadonlyArray<Html>
  readonly align?: 'start' | 'end'
}

export const view = <Message>(
  props: PopoverProps<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Attribute('class', stylex.attrs(styles.wrapper).class ?? '')],
    [
      h.button(
        [
          h.Type('button'),
          h.Id(`${props.id}-trigger`),
          h.AriaExpanded(props.isOpen),
          h.AriaControls(`${props.id}-panel`),
          h.Attribute('class', stylex.attrs(styles.trigger).class ?? ''),
          h.OnClick(props.onToggle),
        ],
        [props.label],
      ),
      props.isOpen
        ? h.div([
            h.Attribute('class', stylex.attrs(styles.scrim).class ?? ''),
            h.OnClick(props.onClose),
          ])
        : h.empty,
      props.isOpen
        ? h.div(
            [
              h.Role('dialog'),
              h.Id(`${props.id}-panel`),
              h.AriaLabelledBy(`${props.id}-trigger`),
              h.Tabindex(-1),
              h.Autofocus(true),
              h.Attribute(
                'class',
                stylex.attrs(
                  styles.panel,
                  props.align === 'end' ? styles.end : styles.start,
                ).class ?? '',
              ),
              h.OnKeyDownPreventDefault(key =>
                key === 'Escape' ? Option.some(props.onClose) : Option.none(),
              ),
            ],
            props.children,
          )
        : h.empty,
    ],
  )
