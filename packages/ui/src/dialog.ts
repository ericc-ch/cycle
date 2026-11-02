import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/dialog'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

export * from '@foldkit/ui/dialog'

const styles = stylex.create({
  dialog: {
    display: 'grid',
    placeItems: 'center',
    padding: space.lg,
  },
  backdrop: {
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

export type RenderConfig = Readonly<{
  title: string
  children: ReadonlyArray<Html>
}>

/** A centred panel on a scrim, closed by its own button, the scrim or Escape.
 *  The close wiring lives in the component's `closeButton` attribute bundle. */
export const render = <Message>(
  info: RenderInfo,
  config: RenderConfig,
  h: HtmlBuilder<Message>,
): Html =>
  h.dialog(
    [
      ...info.dialog,
      h.Attribute('class', stylex.attrs(styles.dialog).class ?? ''),
    ],
    info.isVisible
      ? [
          h.div([
            ...info.backdrop,
            h.Attribute('class', stylex.attrs(styles.backdrop).class ?? ''),
          ]),
          h.div(
            [
              ...info.panel,
              h.Attribute('class', stylex.attrs(styles.panel).class ?? ''),
            ],
            [
              h.h2(
                [
                  ...info.title,
                  h.Attribute('class', stylex.attrs(styles.title).class ?? ''),
                ],
                [config.title],
              ),
              ...config.children,
              h.div(
                [
                  h.Attribute(
                    'class',
                    stylex.attrs(styles.actions).class ?? '',
                  ),
                ],
                [
                  h.button(
                    [
                      ...info.closeButton,
                      h.Attribute(
                        'class',
                        stylex.attrs(styles.close).class ?? '',
                      ),
                    ],
                    ['Close'],
                  ),
                ],
              ),
            ],
          ),
        ]
      : [],
  )
