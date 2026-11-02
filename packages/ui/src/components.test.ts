import type { HtmlBuilder } from 'foldkit/html'
import {
  click,
  expect,
  given,
  hover,
  keydown,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import * as Button from './button'
import * as Dialog from './dialog'
import * as Menu from './menu'
import * as Popover from './popover'
import * as Switch from './switch'
import * as Tabs from './tabs'
import * as ToggleGroup from './toggle-group'
import * as Tooltip from './tooltip'

const flowOptions = [
  { value: 'None', label: 'None' },
  { value: 'Spotting', label: 'Spotting' },
  { value: 'Heavy', label: 'Heavy' },
] as const

type FlowChoice = (typeof flowOptions)[number]['value']

describe('Button', () => {
  test('renders its label and dispatches the click', () => {
    type Model = { readonly clicks: number }

    scene(
      {
        update: (model: Model, message: 'Clicked') =>
          message === 'Clicked'
            ? { model: { clicks: model.clicks + 1 } }
            : { model },
        view: (model: Model, h) =>
          h.div(
            [],
            [
              Button.view<'Clicked'>({ label: 'Save', onClick: 'Clicked' }, h),
              h.p([], [`clicked ${model.clicks}`]),
            ],
          ),
      },
      given({ clicks: 0 }),
      click(role('button', { name: 'Save' })),
      expect(text('clicked 1')).toExist(),
    )
  })

  test('marks a disabled button as disabled', () => {
    scene(
      {
        update: (model: null) => ({ model }),
        view: (_model: null, h) =>
          Button.view({ label: 'Save', onClick: 'Clicked', disabled: true }, h),
      },
      given(null),
      expect(role('button', { name: 'Save' })).toBeDisabled(),
    )
  })
})

describe('ToggleGroup', () => {
  const config = {
    update: (_model: FlowChoice, message: FlowChoice) => ({ model: message }),
    view: (model: FlowChoice, h: HtmlBuilder<FlowChoice>) =>
      ToggleGroup.view<FlowChoice, FlowChoice>(
        {
          label: 'Flow',
          value: model,
          options: flowOptions,
          onChange: value => value,
        },
        h,
      ),
  }

  test('exposes radio semantics on the option that is chosen', () => {
    scene(
      config,
      given<FlowChoice>('None'),
      expect(role('radiogroup', { name: 'Flow' })).toExist(),
      expect(role('radio', { name: 'None' })).toBeChecked(),
      expect(role('radio', { name: 'Heavy' })).not.toBeChecked(),
    )
  })

  test('clicking an option selects it', () => {
    scene(
      config,
      given<FlowChoice>('None'),
      click(role('radio', { name: 'Heavy' })),
      expect(role('radio', { name: 'Heavy' })).toBeChecked(),
      expect(role('radio', { name: 'None' })).not.toBeChecked(),
    )
  })

  test('the arrow keys move the selection', () => {
    scene(
      config,
      given<FlowChoice>('None'),
      keydown(role('radiogroup', { name: 'Flow' }), 'ArrowRight'),
      expect(role('radio', { name: 'Spotting' })).toBeChecked(),
      keydown(role('radiogroup', { name: 'Flow' }), 'ArrowLeft'),
      expect(role('radio', { name: 'None' })).toBeChecked(),
    )
  })
})

describe('Tabs', () => {
  const tabs = [
    { value: 'Today', label: 'Today' },
    { value: 'History', label: 'History' },
  ] as const

  type Tab = (typeof tabs)[number]['value']

  const config = {
    update: (_model: Tab, message: Tab) => ({ model: message }),
    view: (model: Tab, h: HtmlBuilder<Tab>) =>
      Tabs.view<Tab, Tab>(
        {
          idPrefix: 'test',
          label: 'Sections',
          value: model,
          tabs,
          onChange: value => value,
        },
        h,
      ),
  }

  test('marks the current tab and points it at its panel', () => {
    scene(
      config,
      given<Tab>('Today'),
      expect(role('tablist', { name: 'Sections' })).toExist(),
      expect(role('tab', { name: 'Today' })).toHaveAttr(
        'aria-selected',
        'true',
      ),
      expect(role('tab', { name: 'Today' })).toHaveAttr(
        'aria-controls',
        'test-panel-Today',
      ),
      expect(role('tab', { name: 'History' })).toHaveAttr(
        'aria-selected',
        'false',
      ),
    )
  })

  test('the arrow keys move between tabs', () => {
    scene(
      config,
      given<Tab>('Today'),
      keydown(role('tablist', { name: 'Sections' }), 'ArrowRight'),
      expect(role('tab', { name: 'History' })).toHaveAttr(
        'aria-selected',
        'true',
      ),
    )
  })
})

describe('Switch', () => {
  const config = {
    update: (model: boolean, message: 'Toggle') =>
      message === 'Toggle' ? { model: !model } : { model },
    view: (model: boolean, h: HtmlBuilder<'Toggle'>) =>
      Switch.view<'Toggle'>(
        { label: 'Prediction', checked: model, onToggle: 'Toggle' },
        h,
      ),
  }

  test('reports its state with aria-checked', () => {
    scene(
      config,
      given(false),
      expect(role('switch', { name: /Prediction/ })).toHaveAttr(
        'aria-checked',
        'false',
      ),
    )
  })

  test('clicking flips the state', () => {
    scene(
      config,
      given(false),
      click(role('switch', { name: /Prediction/ })),
      expect(role('switch', { name: /Prediction/ })).toBeChecked(),
    )
  })
})

describe('Tooltip', () => {
  const config = {
    update: (_model: boolean, message: 'Show' | 'Hide') =>
      message === 'Show' ? { model: true } : { model: false },
    view: (model: boolean, h: HtmlBuilder<'Show' | 'Hide'>) =>
      Tooltip.view<'Show' | 'Hide'>(
        {
          id: 'tip',
          label: 'confidence',
          content: 'Wide on purpose.',
          isVisible: model,
          onShow: 'Show',
          onHide: 'Hide',
        },
        h,
      ),
  }

  test('shows the tooltip on hover and hides it on leave', () => {
    scene(
      config,
      given(false),
      expect(role('tooltip')).toBeAbsent(),
      hover(role('button', { name: 'confidence' })),
      expect(role('tooltip')).toContainText('Wide on purpose.'),
    )
  })

  test('Escape hides the tooltip', () => {
    scene(
      config,
      given(true),
      expect(role('tooltip')).toExist(),
      keydown(role('button', { name: 'confidence' }), 'Escape'),
      expect(role('tooltip')).toBeAbsent(),
    )
  })
})

describe('Popover', () => {
  const config = {
    update: (model: boolean, message: 'Toggle' | 'Close') =>
      message === 'Toggle' ? { model: !model } : { model: false },
    view: (model: boolean, h: HtmlBuilder<'Toggle' | 'Close'>) =>
      Popover.view<'Toggle' | 'Close'>(
        {
          id: 'legend',
          label: 'what the marks mean',
          isOpen: model,
          onToggle: 'Toggle',
          onClose: 'Close',
          children: [h.p([], ['Darker means heavier.'])],
        },
        h,
      ),
  }

  test('the trigger reports whether the panel is open', () => {
    scene(
      config,
      given(false),
      expect(role('button', { name: 'what the marks mean' })).toHaveAttr(
        'aria-expanded',
        'false',
      ),
      click(role('button', { name: 'what the marks mean' })),
      expect(text('Darker means heavier.')).toExist(),
      expect(role('button', { name: 'what the marks mean' })).toHaveAttr(
        'aria-expanded',
        'true',
      ),
    )
  })

  test('Escape closes the panel', () => {
    scene(
      config,
      given(true),
      keydown(role('dialog'), 'Escape'),
      expect(text('Darker means heavier.')).toBeAbsent(),
    )
  })
})

describe('Menu', () => {
  type MenuMessage =
    | { readonly _tag: 'Toggle' }
    | { readonly _tag: 'Close' }
    | { readonly _tag: 'Active'; readonly index: number }
    | { readonly _tag: 'Pick'; readonly id: string }

  type MenuModel = {
    readonly isOpen: boolean
    readonly activeIndex: number
    readonly picked: string
  }

  const items: ReadonlyArray<Menu.MenuItem<MenuMessage>> = [
    {
      id: 'about',
      label: 'How this works',
      onSelect: { _tag: 'Pick', id: 'about' },
    },
    {
      id: 'clear',
      label: 'Clear all data',
      onSelect: { _tag: 'Pick', id: 'clear' },
    },
  ]

  const config = {
    update: (model: MenuModel, message: MenuMessage): { model: MenuModel } => {
      if (message._tag === 'Toggle') {
        return { model: { ...model, isOpen: !model.isOpen } }
      }

      if (message._tag === 'Close') {
        return { model: { ...model, isOpen: false } }
      }

      if (message._tag === 'Active') {
        return { model: { ...model, activeIndex: message.index } }
      }

      return { model: { ...model, isOpen: false, picked: message.id } }
    },
    view: (model: MenuModel, h: HtmlBuilder<MenuMessage>) =>
      h.div(
        [],
        [
          Menu.view<MenuMessage>(
            {
              id: 'data',
              label: 'Data',
              isOpen: model.isOpen,
              activeIndex: model.activeIndex,
              items,
              onToggle: { _tag: 'Toggle' },
              onClose: { _tag: 'Close' },
              onActiveIndex: index => ({ _tag: 'Active', index }),
            },
            h,
          ),
          h.p([], [`picked ${model.picked}`]),
        ],
      ),
  }

  test('opens with the trigger and lists its items', () => {
    scene(
      config,
      given({ isOpen: false, activeIndex: -1, picked: 'none' }),
      expect(role('menu')).toBeAbsent(),
      click(role('button', { name: 'Data' })),
      expect(role('menu')).toExist(),
      expect(role('menuitem', { name: 'How this works' })).toExist(),
    )
  })

  test('Enter picks the active item', () => {
    scene(
      config,
      given({ isOpen: true, activeIndex: 0, picked: 'none' }),
      keydown(role('menu'), 'ArrowDown'),
      keydown(role('menu'), 'Enter'),
      expect(text('picked clear')).toExist(),
      expect(role('menu')).toBeAbsent(),
    )
  })

  test('Escape closes the menu without picking', () => {
    scene(
      config,
      given({ isOpen: true, activeIndex: 0, picked: 'none' }),
      keydown(role('menu'), 'Escape'),
      expect(role('menu')).toBeAbsent(),
      expect(text('picked none')).toExist(),
    )
  })
})

describe('Dialog', () => {
  const config = {
    update: (_model: boolean, _message: 'Close') => ({ model: false }),
    view: (model: boolean, h: HtmlBuilder<'Close'>) =>
      model
        ? Dialog.view<'Close'>(
            {
              id: 'explainer',
              title: 'How the range is calculated',
              children: [h.p([], ['The centre is the median.'])],
              onClose: 'Close',
            },
            h,
          )
        : h.p([], ['closed']),
  }

  test('is a modal dialog labelled by its title', () => {
    scene(
      config,
      given(true),
      expect(role('dialog')).toHaveAccessibleName(
        'How the range is calculated',
      ),
      expect(role('dialog')).toHaveAttr('aria-modal', 'true'),
    )
  })

  test('Escape closes it', () => {
    scene(
      config,
      given(true),
      keydown(role('dialog'), 'Escape'),
      expect(role('dialog')).toBeAbsent(),
      expect(text('closed')).toExist(),
    )
  })

  test('the close button closes it', () => {
    scene(
      config,
      given(true),
      click(role('button', { name: 'Close' })),
      expect(role('dialog')).toBeAbsent(),
    )
  })
})
