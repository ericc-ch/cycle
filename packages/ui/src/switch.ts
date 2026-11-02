import type { Html, HtmlBuilder } from 'foldkit/html'

import { view } from '@foldkit/ui/switch'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

export * from '@foldkit/ui/switch'

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
    fontFamily: font.sans,
    fontSize: typeScale.base,
    color: palette.fg0,
    cursor: 'pointer',
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
    padding: 0,
    cursor: 'pointer',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
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
  label: {
    cursor: 'pointer',
  },
  state: {
    fontFamily: font.mono,
    fontSize: typeScale.sm,
    color: palette.fg1,
  },
})

export type RenderConfig<Message> = Readonly<{
  id: string
  label: string
  isChecked: boolean
  onToggle: (isChecked: boolean) => Message
}>

export const render = <Message>(
  config: RenderConfig<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      toView: attributes =>
        h.div(
          [h.Attribute('class', stylex.attrs(styles.root).class ?? '')],
          [
            h.button(
              [
                ...attributes.button,
                h.Attribute('class', stylex.attrs(styles.track).class ?? ''),
              ],
              [
                h.span([
                  h.Attribute(
                    'class',
                    stylex.attrs(
                      styles.thumb,
                      config.isChecked && styles.thumbOn,
                    ).class ?? '',
                  ),
                ]),
              ],
            ),
            h.label(
              [
                ...attributes.label,
                h.Attribute('class', stylex.attrs(styles.label).class ?? ''),
              ],
              [config.label],
            ),
            h.span(
              [h.Attribute('class', stylex.attrs(styles.state).class ?? '')],
              [config.isChecked ? 'on' : 'off'],
            ),
          ],
        ),
    },
    h,
  )
