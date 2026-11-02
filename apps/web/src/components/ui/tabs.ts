import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo } from '@foldkit/ui/tabs'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/tabs'

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

/** Lays out the tab list and the active panel. The panel content is supplied
 *  by the app, because only the app knows what each tab holds. */
export const render = <Value extends string, Message>(
  info: RenderInfo<Value>,
  panel: (value: Value) => Html,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      h.div(
        [
          ...info.tablist,
          h.Attribute('class', stylex.attrs(styles.list).class ?? ''),
        ],
        info.tabs.map(tab =>
          h.keyed('button')(
            tab.value,
            [
              ...tab.tab,
              h.Attribute(
                'class',
                stylex.attrs(styles.tab, tab.isActive && styles.selected)
                  .class ?? '',
              ),
            ],
            [tab.value],
          ),
        ),
      ),
      ...info.tabs
        .filter(tab => tab.index === info.activeIndex)
        .map(tab => h.div([...tab.panel], [panel(tab.value)])),
    ],
  )
