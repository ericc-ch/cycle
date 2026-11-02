import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RenderInfo, TabInfo } from '@foldkit/ui/tabs'
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
  trigger: {
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
  triggerSelected: {
    color: palette.fg0,
    textDecorationLine: 'underline',
    textDecorationThickness: '2px',
    textUnderlineOffset: '0.24em',
    textDecorationColor: 'currentcolor',
  },
})

/** The tab list. Renders one trigger per tab, in the order the app supplied:
 *  shadcn's `TabsList` owns its `TabsTrigger`s the same way. */
export const list = <Value extends string, Message>(
  info: RenderInfo<Value>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      ...info.tablist,
      h.DataAttribute('slot', 'tabs-list'),
      h.Attribute('class', stylex.attrs(styles.list).class ?? ''),
    ],
    info.tabs.map(tab => trigger(tab, h)),
  )

/** One tab button. Marked with `data-state`, as shadcn marks its trigger. */
export const trigger = <Value extends string, Message>(
  tab: TabInfo<Value>,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('button')(
    tab.value,
    [
      ...tab.tab,
      h.DataAttribute('slot', 'tabs-trigger'),
      h.DataAttribute('state', tab.isActive ? 'active' : 'inactive'),
      h.Attribute(
        'class',
        stylex.attrs(styles.trigger, tab.isActive && styles.triggerSelected)
          .class ?? '',
      ),
    ],
    [tab.value],
  )

/** The panel for one tab. The app renders only the active one, which is the
 *  `ActiveOnly` mount strategy the component defaults to. */
export const panel = <Value extends string, Message>(
  tab: TabInfo<Value>,
  children: Html,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([...tab.panel, h.DataAttribute('slot', 'tabs-content')], [children])
