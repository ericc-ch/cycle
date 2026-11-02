import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from './tokens.stylex.js'

const styles = stylex.create({
  wrapper: {
    position: 'relative',
    display: 'inline-block',
  },
  trigger: {
    fontFamily: font.sans,
    fontSize: 'inherit',
    color: 'inherit',
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
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 20,
  },
  panel: {
    position: 'absolute',
    insetInlineEnd: 0,
    top: '100%',
    zIndex: 21,
    minWidth: '14rem',
    marginTop: space.sm,
    paddingBlock: space.xs,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.line,
    backgroundColor: palette.bg0,
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  item: {
    display: 'block',
    width: '100%',
    textAlign: 'start',
    fontFamily: font.sans,
    fontSize: typeScale.sm,
    color: palette.fg0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: `${space.sm} ${space.md}`,
    cursor: 'pointer',
    ':hover': { backgroundColor: palette.bg1 },
  },
  active: {
    backgroundColor: palette.bg1,
  },
})

export type MenuItem<Message> = {
  readonly id: string
  readonly label: string
  readonly onSelect: Message
  readonly disabled?: boolean
}

export type MenuProps<Message> = {
  readonly id: string
  readonly label: string
  readonly isOpen: boolean
  readonly activeIndex: number
  readonly items: ReadonlyArray<MenuItem<Message>>
  readonly onToggle: Message
  readonly onClose: Message
  readonly onActiveIndex: (index: number) => Message
}

const nextIndexFor = (
  key: string,
  currentIndex: number,
  count: number,
): Option.Option<number> => {
  const lastIndex = count - 1

  if (key === 'ArrowDown') {
    return Option.some(currentIndex >= lastIndex ? 0 : currentIndex + 1)
  }

  if (key === 'ArrowUp') {
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

export const view = <Message>(
  props: MenuProps<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const activeItem = Array.get(props.items, props.activeIndex)

  const keyMessage = (key: string): Option.Option<Message> => {
    if (key === 'Escape' || key === 'Tab') {
      return Option.some(props.onClose)
    }

    if (key === 'Enter' || key === ' ') {
      return Option.map(activeItem, item => item.onSelect)
    }

    return Option.map(
      nextIndexFor(key, props.activeIndex, props.items.length),
      index => props.onActiveIndex(index),
    )
  }

  return h.span(
    [h.Attribute('class', stylex.attrs(styles.wrapper).class ?? '')],
    [
      h.button(
        [
          h.Type('button'),
          h.Id(`${props.id}-trigger`),
          h.AriaHasPopup('menu'),
          h.AriaExpanded(props.isOpen),
          h.AriaControls(`${props.id}-panel`),
          h.Attribute('class', stylex.attrs(styles.trigger).class ?? ''),
          h.OnClick(props.onToggle),
        ],
        [props.label],
      ),
      props.isOpen
        ? h.div([
            h.Attribute('class', stylex.attrs(styles.scrim).class ?? ''),
            h.OnClick(props.onClose),
          ])
        : h.empty,
      props.isOpen
        ? h.div(
            [
              h.Role('menu'),
              h.Id(`${props.id}-panel`),
              h.AriaLabelledBy(`${props.id}-trigger`),
              h.Tabindex(-1),
              h.Autofocus(true),
              ...(props.activeIndex < 0
                ? []
                : [
                    h.AriaActiveDescendant(
                      `${props.id}-item-${props.activeIndex}`,
                    ),
                  ]),
              h.Attribute('class', stylex.attrs(styles.panel).class ?? ''),
              h.OnKeyDownPreventDefault(keyMessage),
            ],
            Array.map(props.items, (item, index) =>
              h.keyed('button')(
                item.id,
                [
                  h.Type('button'),
                  h.Role('menuitem'),
                  h.Id(`${props.id}-item-${index}`),
                  h.Disabled(item.disabled ?? false),
                  h.AriaDisabled(item.disabled ?? false),
                  h.OnMouseEnter(props.onActiveIndex(index)),
                  h.OnClick(item.onSelect),
                  h.Attribute(
                    'class',
                    stylex.attrs(
                      styles.item,
                      index === props.activeIndex && styles.active,
                    ).class ?? '',
                  ),
                ],
                [item.label],
              ),
            ),
          )
        : h.empty,
    ],
  )
}
