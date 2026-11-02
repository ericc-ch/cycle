import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/dialog'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/dialog'

const styles = stylex.create({
  dialog: {
    display: 'grid',
    placeItems: 'center',
    padding: space.lg,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: palette.halo,
  },
  content: {
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
  contentWrapper: {
    display: 'contents',
  },
  title: {
    margin: 0,
    marginBottom: space.md,
    fontSize: typeScale.lg,
    fontWeight: 600,
    letterSpacing: '-0.011em',
  },
  description: {
    margin: 0,
    color: palette.fg1,
  },
  footer: {
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

/** The native dialog element. Render it even while closed: the element has to
 *  exist for the component's open command to find it by id. */
export const root = <Message>(
  info: RenderInfo,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.dialog(
    [
      ...info.dialog,
      h.DataAttribute('slot', 'dialog'),
      h.DataAttribute('state', info.isVisible ? 'open' : 'closed'),
      h.Attribute('class', stylex.attrs(styles.dialog).class ?? ''),
    ],
    info.isVisible ? children : [],
  )

/** The scrim and the panel, inside the dialog element. `hasDescription` is a
 *  `viewInputs` flag, not a render flag, so the description is optional here. */
export const content = <Message>(
  info: RenderInfo,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Attribute('class', stylex.attrs(styles.contentWrapper).class ?? '')],
    [
      h.div([
        ...info.backdrop,
        h.DataAttribute('slot', 'dialog-overlay'),
        h.Attribute('class', stylex.attrs(styles.overlay).class ?? ''),
      ]),
      h.div(
        [
          ...info.panel,
          h.DataAttribute('slot', 'dialog-content'),
          h.Attribute('class', stylex.attrs(styles.content).class ?? ''),
        ],
        children,
      ),
    ],
  )

export const title = <Message>(
  info: RenderInfo,
  text: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.h2(
    [
      ...info.title,
      h.DataAttribute('slot', 'dialog-title'),
      h.Attribute('class', stylex.attrs(styles.title).class ?? ''),
    ],
    [text],
  )

export const description = <Message>(
  info: RenderInfo,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.p(
    [
      ...info.description,
      h.DataAttribute('slot', 'dialog-description'),
      h.Attribute('class', stylex.attrs(styles.description).class ?? ''),
    ],
    children,
  )

export const footer = <Message>(
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.DataAttribute('slot', 'dialog-footer'),
      h.Attribute('class', stylex.attrs(styles.footer).class ?? ''),
    ],
    children,
  )

export const closeButton = <Message>(
  info: RenderInfo,
  label: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      ...info.closeButton,
      h.DataAttribute('slot', 'dialog-close'),
      h.Attribute('class', stylex.attrs(styles.close).class ?? ''),
    ],
    [label],
  )

export type RenderConfig = Readonly<{
  title: string
  children: ReadonlyArray<Html>
  closeLabel?: string
}>

/** The default composition: title, body, and a footer with the close button. */
export const render = <Message>(
  info: RenderInfo,
  config: RenderConfig,
  h: HtmlBuilder<Message>,
): Html =>
  root(
    info,
    [
      content(
        info,
        [
          title(info, config.title, h),
          ...config.children,
          footer([closeButton(info, config.closeLabel ?? 'Close', h)], h),
        ],
        h,
      ),
    ],
    h,
  )
