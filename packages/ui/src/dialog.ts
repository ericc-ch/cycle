import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 40,
    display: 'grid',
    placeItems: 'center',
    padding: space.lg,
  },
  scrim: {
    position: 'absolute',
    inset: 0,
    backgroundColor: palette.halo,
  },
  panel: {
    position: 'relative',
    zIndex: 41,
    width: 'min(32rem, 100%)',
    maxHeight: 'calc(100dvh - 2rem)',
    overflowY: 'auto',
    padding: space.xxl,
    backgroundColor: palette.bg0,
    color: palette.fg0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.line,
    fontFamily: font.sans,
    fontSize: typeScale.base,
    lineHeight: 1.5,
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  title: {
    margin: 0,
    marginBottom: space.md,
    fontSize: typeScale.lg,
    fontWeight: 600,
    letterSpacing: '-0.011em',
  },
  actions: {
    marginTop: space.xxl,
  },
  close: {
    fontFamily: font.sans,
    fontSize: typeScale.base,
    color: palette.fg0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    cursor: 'pointer',
    textDecorationLine: 'underline',
    textUnderlineOffset: '0.18em',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
})

export type DialogProps<Message> = {
  readonly id: string
  readonly title: string
  readonly children: ReadonlyArray<Html>
  readonly onClose: Message
}

export const view = <Message>(
  props: DialogProps<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Attribute('class', stylex.attrs(styles.overlay).class ?? '')],
    [
      h.div([
        h.Attribute('class', stylex.attrs(styles.scrim).class ?? ''),
        h.OnClick(props.onClose),
      ]),
      h.div(
        [
          h.Role('dialog'),
          h.Id(props.id),
          h.AriaModal(true),
          h.AriaLabelledBy(`${props.id}-title`),
          h.Tabindex(-1),
          h.Autofocus(true),
          h.Attribute('class', stylex.attrs(styles.panel).class ?? ''),
          h.OnKeyDownPreventDefault(key =>
            key === 'Escape' ? Option.some(props.onClose) : Option.none(),
          ),
        ],
        [
          h.h2(
            [
              h.Id(`${props.id}-title`),
              h.Attribute('class', stylex.attrs(styles.title).class ?? ''),
            ],
            [props.title],
          ),
          ...props.children,
          h.div(
            [h.Attribute('class', stylex.attrs(styles.actions).class ?? '')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.OnClick(props.onClose),
                  h.Attribute('class', stylex.attrs(styles.close).class ?? ''),
                ],
                ['Close'],
              ),
            ],
          ),
        ],
      ),
    ],
  )
