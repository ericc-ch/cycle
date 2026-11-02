import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

const styles = stylex.create({
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.lg,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: palette.line,
    paddingBottom: space.sm,
  },
  tab: {
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

export type TabItem<Value extends string> = {
  readonly value: Value
  readonly label: string
}

export type TabsProps<Value extends string, Message> = {
  readonly idPrefix: string
  readonly label: string
  readonly value: Value
  readonly tabs: ReadonlyArray<TabItem<Value>>
  readonly onChange: (value: Value) => Message
}

const targetIndexFor = (
  key: string,
  currentIndex: number,
  lastIndex: number,
): Option.Option<number> => {
  if (key === 'ArrowRight') {
    return Option.some(currentIndex >= lastIndex ? 0 : currentIndex + 1)
  }

  if (key === 'ArrowLeft') {
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
  tabs: ReadonlyArray<TabItem<Value>>,
  value: Value,
  key: string,
): Option.Option<Value> => {
  const currentIndex = Option.getOrElse(
    Array.findFirstIndex(tabs, tab => tab.value === value),
    () => 0,
  )

  return Option.flatMap(
    targetIndexFor(key, currentIndex, tabs.length - 1),
    index => Option.map(Array.get(tabs, index), tab => tab.value),
  )
}

export const view = <Value extends string, Message>(
  props: TabsProps<Value, Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Role('tablist'),
      h.AriaLabel(props.label),
      h.Attribute('class', stylex.attrs(styles.list).class ?? ''),
      h.OnKeyDownFocus(key =>
        Option.map(nextValue(props.tabs, props.value, key), value => ({
          focusSelector: `[data-tab="${value}"]`,
          message: props.onChange(value),
        })),
      ),
    ],
    Array.map(props.tabs, tab =>
      h.keyed('button')(
        tab.value,
        [
          h.Type('button'),
          h.Role('tab'),
          h.Id(`${props.idPrefix}-tab-${tab.value}`),
          h.AriaSelected(tab.value === props.value),
          h.AriaControls(`${props.idPrefix}-panel-${tab.value}`),
          h.Tabindex(tab.value === props.value ? 0 : -1),
          h.DataAttribute('tab', tab.value),
          h.OnClick(props.onChange(tab.value)),
          h.Attribute(
            'class',
            stylex.attrs(
              styles.tab,
              tab.value === props.value && styles.selected,
            ).class ?? '',
          ),
        ],
        [tab.label],
      ),
    ),
  )

export type TabPanelProps = {
  readonly idPrefix: string
  readonly value: string
  readonly current: string
  readonly children: ReadonlyArray<Html>
}

export const panel = <Message>(
  props: TabPanelProps,
  h: HtmlBuilder<Message>,
): Html =>
  props.value === props.current
    ? h.div(
        [
          h.Role('tabpanel'),
          h.Id(`${props.idPrefix}-panel-${props.value}`),
          h.AriaLabelledBy(`${props.idPrefix}-tab-${props.value}`),
          h.Tabindex(0),
        ],
        props.children,
      )
    : h.empty
