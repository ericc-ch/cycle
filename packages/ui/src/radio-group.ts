import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/radioGroup'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

export * from '@foldkit/ui/radioGroup'

const styles = stylex.create({
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.lg,
  },
  option: {
    appearance: 'none',
    fontFamily: font.sans,
    fontSize: typeScale.base,
    lineHeight: 1.5,
    color: palette.fg1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    cursor: 'pointer',
    textDecorationLine: 'none',
    ':hover': { color: palette.fg0 },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  selected: {
    color: palette.fg0,
    textDecorationLine: 'underline',
    textDecorationThickness: '2px',
    textUnderlineOffset: '0.24em',
    textDecorationColor: 'currentcolor',
  },
})

/** Renders a row of text options where the chosen one is underlined. */
export const render = <Value extends string, Message>(
  info: RenderInfo<Value>,
  label: (value: Value) => string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      ...info.group,
      h.Attribute('class', stylex.attrs(styles.group).class ?? ''),
    ],
    info.options.map(option =>
      h.keyed('button')(
        option.value,
        [
          ...option.option,
          h.Attribute(
            'class',
            stylex.attrs(styles.option, option.isSelected && styles.selected)
              .class ?? '',
          ),
        ],
        [h.span([...option.label], [label(option.value)])],
      ),
    ),
  )
