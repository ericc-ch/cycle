import type { Html, HtmlBuilder } from 'foldkit/html'

import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
    fontFamily: font.sans,
    fontSize: typeScale.base,
    color: palette.fg0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    cursor: 'pointer',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  track: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    width: '34px',
    height: '18px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.fg1,
    backgroundColor: 'transparent',
  },
  thumb: {
    width: '8px',
    height: '8px',
    marginInlineStart: '4px',
    backgroundColor: 'transparent',
  },
  thumbOn: {
    marginInlineStart: 'auto',
    marginInlineEnd: '4px',
    backgroundColor: palette.fg0,
  },
  state: {
    fontFamily: font.mono,
    fontSize: typeScale.sm,
    color: palette.fg1,
  },
})

export type SwitchProps<Message> = {
  readonly label: string
  readonly checked: boolean
  readonly onToggle: Message
}

export const view = <Message>(
  props: SwitchProps<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.Role('switch'),
      h.AriaChecked(props.checked),
      h.OnClick(props.onToggle),
      h.Attribute('class', stylex.attrs(styles.root).class ?? ''),
    ],
    [
      h.span(
        [h.Attribute('class', stylex.attrs(styles.track).class ?? '')],
        [
          h.span([
            h.Attribute(
              'class',
              stylex.attrs(styles.thumb, props.checked && styles.thumbOn)
                .class ?? '',
            ),
          ]),
        ],
      ),
      h.span([], [props.label]),
      h.span(
        [h.Attribute('class', stylex.attrs(styles.state).class ?? '')],
        [props.checked ? 'on' : 'off'],
      ),
    ],
  )
