import type { Html, HtmlBuilder } from 'foldkit/html'

import { type ButtonAttributes, view } from '@foldkit/ui/button'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/button'

const styles = stylex.create({
  base: {
    display: 'inline',
    fontFamily: font.sans,
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
  ghost: {
    color: palette.fg1,
  },
  sm: {
    fontSize: typeScale.sm,
  },
  default: {
    fontSize: typeScale.base,
  },
  lg: {
    fontSize: typeScale.lg,
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typeScale.base,
    paddingBlock: space.xs,
    paddingInline: space.xs,
  },
  disabled: {
    color: palette.fg2,
    cursor: 'default',
    textDecorationColor: 'transparent',
  },
})

/** The variants this design can render. `default`, `outline`, `secondary` and
 *  `destructive` all need a filled or bordered surface, which the design
 *  forbids: "an underline that firms up on hover, no backgrounds, no pills, no
 *  arrows, no primary button" (`docs/DESIGN.md` in the site repo). */
export type Variant = 'link' | 'ghost'

export type Size = 'sm' | 'default' | 'lg' | 'icon'

export type RenderConfig<Message> = Readonly<{
  label: string
  onClick?: Message
  variant?: Variant
  size?: Size
  isDisabled?: boolean
}>

/** A text button. `link` is the default because it is the only treatment the
 *  design allows; `ghost` is the same control in muted ink. */
export const render = <Message>(
  config: RenderConfig<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const variant = config.variant ?? 'link'
  const size = config.size ?? 'default'

  return view(
    {
      ...(config.onClick === undefined ? {} : { onClick: config.onClick }),
      isDisabled: config.isDisabled ?? false,
      toView: (attributes: ButtonAttributes<Message>) =>
        h.button(
          [
            ...attributes.button,
            h.DataAttribute('slot', 'button'),
            h.DataAttribute('variant', variant),
            h.DataAttribute('size', size),
            h.Attribute(
              'class',
              stylex.attrs(
                styles.base,
                variant === 'ghost' && styles.ghost,
                size === 'sm' && styles.sm,
                size === 'default' && styles.default,
                size === 'lg' && styles.lg,
                size === 'icon' && styles.icon,
                config.isDisabled === true && styles.disabled,
              ).class ?? '',
            ),
          ],
          [config.label],
        ),
    },
    h,
  )
}
