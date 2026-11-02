import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

const styles = stylex.create({
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: space.lg,
    padding: 0,
    margin: 0,
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

export type ToggleOption<Value extends string> = {
  readonly value: Value
  readonly label: string
}

export type ToggleGroupProps<Value extends string, Message> = {
  readonly label: string
  readonly value: Value
  readonly options: ReadonlyArray<ToggleOption<Value>>
  readonly onChange: (value: Value) => Message
}

const targetIndexFor = (
  key: string,
  currentIndex: number,
  lastIndex: number,
): Option.Option<number> => {
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return Option.some(currentIndex >= lastIndex ? 0 : currentIndex + 1)
  }

  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return Option.some(currentIndex <= 0 ? lastIndex : currentIndex - 1)
  }

  if (key === 'Home') {
    return Option.some(0)
  }

  if (key === 'End') {
    return Option.some(lastIndex)
  }

  return Option.none()
}

const nextValue = <Value extends string>(
  options: ReadonlyArray<ToggleOption<Value>>,
  value: Value,
  key: string,
): Option.Option<Value> => {
  const currentIndex = Option.getOrElse(
    Array.findFirstIndex(options, option => option.value === value),
    () => 0,
  )

  return Option.flatMap(
    targetIndexFor(key, currentIndex, options.length - 1),
    index => Option.map(Array.get(options, index), option => option.value),
  )
}

export const view = <Value extends string, Message>(
  props: ToggleGroupProps<Value, Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Role('radiogroup'),
      h.AriaLabel(props.label),
      h.Attribute('class', stylex.attrs(styles.group).class ?? ''),
      h.OnKeyDownFocus(key =>
        Option.map(nextValue(props.options, props.value, key), value => ({
          focusSelector: `[data-option="${value}"]`,
          message: props.onChange(value),
        })),
      ),
    ],
    Array.map(props.options, option =>
      h.keyed('button')(
        option.value,
        [
          h.Type('button'),
          h.Role('radio'),
          h.AriaChecked(option.value === props.value),
          h.Tabindex(option.value === props.value ? 0 : -1),
          h.DataAttribute('option', option.value),
          h.OnClick(props.onChange(option.value)),
          h.Attribute(
            'class',
            stylex.attrs(
              styles.option,
              option.value === props.value && styles.selected,
            ).class ?? '',
          ),
        ],
        [option.label],
      ),
    ),
  )
