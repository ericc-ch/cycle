import type { Html, HtmlBuilder } from 'foldkit/html'

import type { OptionInfo, RenderInfo } from '@foldkit/ui/radioGroup'
import * as stylex from '@stylexjs/stylex'

import { font, palette, size, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/radioGroup'

const styles = stylex.create({
  /* One row of equal cells, each a full touch target. No box, no fill: the
   *  label is the control, as everywhere else in this design. */
  group: {
    display: 'flex',
    width: '100%',
    '@media (min-width: 48rem)': {
      gap: space.lg,
    },
  },
  item: {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: size.tap,
    paddingInline: space.xs,
    fontFamily: font.sans,
    fontSize: typeScale.base,
    lineHeight: 1.5,
    color: palette.fg1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    cursor: 'pointer',
    textDecorationLine: 'none',
    ':hover': { color: palette.fg0 },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '-2px',
    },
    '@media (min-width: 48rem)': {
      flexGrow: 0,
      flexBasis: 'auto',
      paddingInline: 0,
      ':focus-visible': { outlineOffset: '2px' },
    },
  },
  itemChecked: {
    color: palette.fg0,
    textDecorationLine: 'underline',
    textDecorationThickness: '2px',
    textUnderlineOffset: '0.24em',
    textDecorationColor: 'currentcolor',
  },
})

/** One option. The visible label carries the id the component points
 *  `aria-labelledby` at, so it must be rendered. */
export const item = <Value extends string, Message>(
  option: OptionInfo<Value>,
  label: (value: Value) => string,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('button')(
    option.value,
    [
      ...option.option,
      h.DataAttribute('slot', 'radio-group-item'),
      h.DataAttribute('state', option.isSelected ? 'checked' : 'unchecked'),
      h.Attribute(
        'class',
        stylex.attrs(styles.item, option.isSelected && styles.itemChecked)
          .class ?? '',
      ),
    ],
    [h.span([...option.label], [label(option.value)])],
  )

/** The group. Renders one item per option, which is how shadcn's RadioGroup
 *  owns its RadioGroupItems. */
export const group = <Value extends string, Message>(
  info: RenderInfo<Value>,
  label: (value: Value) => string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      ...info.group,
      h.DataAttribute('slot', 'radio-group'),
      h.Attribute('class', stylex.attrs(styles.group).class ?? ''),
    ],
    info.options.map(option => item(option, label, h)),
  )

/** Kept as the common entry point: the app supplies the labels, the package
 *  supplies the layout. */
export const render = group
