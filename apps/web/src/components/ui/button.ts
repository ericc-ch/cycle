import type { Html, HtmlBuilder } from 'foldkit/html'

import { type ButtonAttributes, view } from '@foldkit/ui/button'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/button'

const styles = stylex.create({
  base: {
    fontFamily: font.sans,
    fontSize: typeScale.base,
    lineHeight: 1.5,
    color: palette.fg0,
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
  quiet: {
    color: palette.fg1,
  },
  bare: {
    textDecorationLine: 'none',
  },
  square: {
    padding: space.xs,
    paddingInline: space.sm,
  },
  disabled: {
    color: palette.fg2,
    cursor: 'default',
    textDecorationColor: 'transparent',
  },
})

export type Variant = 'plain' | 'quiet' | 'bare' | 'square'

export type RenderConfig<Message> = Readonly<{
  label: string
  onClick?: Message
  variant?: Variant
  isDisabled?: boolean
}>

/** A text-first button: underlined by default, no fill, no radius. */
export const render = <Message>(
  config: RenderConfig<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  view(
    {
      ...(config.onClick === undefined ? {} : { onClick: config.onClick }),
      isDisabled: config.isDisabled ?? false,
      toView: (attributes: ButtonAttributes<Message>) =>
        h.button(
          [
            ...attributes.button,
            h.Attribute(
              'class',
              stylex.attrs(
                styles.base,
                config.variant === 'quiet' && styles.quiet,
                config.variant === 'bare' && styles.bare,
                config.variant === 'square' && styles.square,
                config.isDisabled === true && styles.disabled,
              ).class ?? '',
            ),
          ],
          [config.label],
        ),
    },
    h,
  )
