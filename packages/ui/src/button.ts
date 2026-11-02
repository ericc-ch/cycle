import type { Html, HtmlBuilder } from 'foldkit/html'

import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

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
    ':disabled': {
      color: palette.fg2,
      cursor: 'default',
      textDecorationColor: 'transparent',
    },
  },
  quiet: {
    color: palette.fg1,
  },
  bare: {
    textDecorationLine: 'none',
  },
  square: {
    padding: `${space.xs} ${space.sm}`,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.line,
    textDecorationLine: 'none',
  },
})

export type ButtonVariant = 'plain' | 'quiet' | 'bare' | 'square'

export type ButtonProps<Message> = {
  readonly label: string
  readonly onClick: Message
  readonly variant?: ButtonVariant
  readonly disabled?: boolean
  readonly type?: 'button' | 'submit'
  readonly ariaLabel?: string
}

const variantStyle = (variant: ButtonVariant | undefined) => {
  if (variant === 'quiet') {
    return styles.quiet
  }

  if (variant === 'bare') {
    return styles.bare
  }

  return variant === 'square' ? styles.square : false
}

export const view = <Message>(
  props: ButtonProps<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const className = stylex.attrs(styles.base, variantStyle(props.variant)).class

  return h.button(
    [
      h.Type(props.type ?? 'button'),
      h.Disabled(props.disabled ?? false),
      h.OnClick(props.onClick),
      h.Attribute('class', className ?? ''),
      ...(props.ariaLabel === undefined ? [] : [h.AriaLabel(props.ariaLabel)]),
    ],
    [props.label],
  )
}
