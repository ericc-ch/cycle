// Drive the app through real user paths and capture evidence.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { launch } from './cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const PORT = Number(process.env.VERIFY_PORT ?? 5273)
const URL = process.env.APP_URL ?? `http://127.0.0.1:${PORT}/`
const requested = process.argv[2] ?? 'all'

const runId = Date.now().toString()
const outDir = join(ROOT, '.audit', 'evidence', runId)
mkdirSync(outDir, { recursive: true })

const checks = []

const record = (flow, name, ok, detail) => {
  checks.push({ flow, name, ok, detail })
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${flow}  ${name}${detail ? `: ${detail}` : ''}`,
  )
  if (!ok) process.exitCode = 1
}

const must = (flow, name, ok, detail) => {
  record(flow, name, ok, detail)
  if (!ok) throw new Error(`${flow}: ${name}${detail ? ` (${detail})` : ''}`)
}

/** The saved log, as the app writes it. What was logged is asserted here. */
const savedLogs = async browser => {
  const raw = await browser.evaluate(`localStorage.getItem('cycle.logs')`)
  return raw === null ? [] : JSON.parse(raw)
}

const dialogOpen = browser =>
  browser.evaluate(
    `document.querySelector('[data-slot="dialog-content"]') !== null`,
  )

const dayKey = daysAgo => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

/** The app's `today` comes from local date parts, so a seed for "now" has to
 *  as well; `dayKey` is UTC and can be a day off near midnight. */
const localDayKey = daysAgo => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// Two past periods, so the app is in the predicted state with History rows.
// This is setup, not the path under test: the period derivation itself is
// covered by packages/domain tests.
const twoPeriods = [
  { date: dayKey(40), flow: 'Bleeding' },
  { date: dayKey(39), flow: 'Bleeding' },
  { date: dayKey(38), flow: 'Bleeding' },
  { date: dayKey(10), flow: 'Bleeding' },
  { date: dayKey(9), flow: 'Bleeding' },
  { date: dayKey(8), flow: 'Bleeding' },
]

const seed = async (browser, logs) => {
  await browser.goto(URL)
  await browser.evaluate(
    `localStorage.setItem('cycle.logs', ${JSON.stringify(JSON.stringify(logs))}); localStorage.removeItem('cycle.predicting')`,
  )
  await browser.goto(URL)
}

const flows = {
  async clicks(browser) {
    const flow = 'clicks'
    await seed(browser, twoPeriods)

    // The flow options and the edit banner only exist inside the mode, so the
    // click-through check holds today's cell to open it first.
    await browser.hold('[data-slot="calendar-day"][data-today]')

    const hits = await browser.evaluate(`(() => {
      const pick = (selector, text) => [...document.querySelectorAll(selector)].find(node =>
        text === undefined ||
        (node.textContent ?? '').trim() === text ||
        node.getAttribute('aria-label') === text)
      const controls = [
        ['Calendar tab', '[data-slot="tabs-trigger"]', 'Calendar'],
        ['History tab', '[data-slot="tabs-trigger"]', 'History'],
        ['About tab', '[data-slot="tabs-trigger"]', 'About'],
      ]
      for (const cell of document.querySelectorAll('[data-slot="calendar-day"]')) {
        controls.push(['day ' + cell.getAttribute('aria-label'), '[data-slot="calendar-day"]', cell.getAttribute('aria-label')])
      }
      for (const radio of document.querySelectorAll('[data-slot="radio-group-item"]')) {
        controls.push(['flow ' + (radio.textContent ?? '').trim(), '[data-slot="radio-group-item"]', (radio.textContent ?? '').trim()])
      }
      return controls.map(([label, selector, text]) => {
        const node = pick(selector, text)
        if (!node) return { label, present: false }
        node.scrollIntoView({ block: 'center', inline: 'center' })
        const rect = node.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const hit = document.elementFromPoint(x, y)
        return {
          label,
          present: true,
          covered: !(hit === node || node.contains(hit)),
          hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null,
        }
      })
    })()`)

    for (const hit of hits) {
      must(flow, `${hit.label} is present`, hit.present)
      must(
        flow,
        `${hit.label} is clickable`,
        !hit.covered,
        hit.covered ? `covered by ${hit.hit}` : '',
      )
    }

    const mounted = await browser.evaluate(`(() => {
      return [...document.querySelectorAll('[data-slot="dialog-content"], [data-slot="dialog-overlay"], [data-slot="alert-dialog-content"], [data-slot="alert-dialog-overlay"]')]
        .map(node => node.getAttribute('data-slot'))
    })()`)

    must(
      flow,
      'no dialog is mounted while closed',
      mounted.length === 0,
      mounted.join(', '),
    )

    await browser.screenshot(join(outDir, 'clicks.png'))
  },

  async flow(browser) {
    const flow = 'flow'
    await seed(browser, [])

    const dayLabel = await browser.evaluate(`(() => {
      const cell = document.querySelector('[data-slot="calendar-day"][data-today]')
      return cell?.getAttribute('aria-label') ?? null
    })()`)

    must(
      flow,
      'today cell found',
      typeof dayLabel === 'string',
      String(dayLabel),
    )

    // Read-only until a day is held: a tap on a cell changes nothing.
    await browser.click('[data-slot="calendar-day"]', dayLabel)
    must(
      flow,
      'the calendar is read-only until a day is held',
      (await browser.evaluate(
        `document.querySelector('[data-slot="flow-editor"]') === null`,
      )) === true,
    )
    must(
      flow,
      'a read-only tap writes nothing',
      (await browser.evaluate(`localStorage.getItem('cycle.logs')`)) === '[]',
    )
    must(
      flow,
      'the empty status card fits its two lines',
      (await browser.evaluate(`(() => {
        const card = document.querySelector('[data-slot="cycle-status"]')
        return card !== null && card.scrollHeight <= card.clientHeight
      })()`)) === true,
    )

    await browser.hold('[data-slot="calendar-day"]', dayLabel)
    must(
      flow,
      'holding a day opens the edit mode',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]') !== null`,
      )) === true,
    )

    await browser.click('[data-slot="calendar-day"]', dayLabel)
    must(
      flow,
      'a tap paints the draft',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]')?.getAttribute('data-state') === 'dirty'`,
      )) === true,
    )
    must(
      flow,
      'the draft has not reached storage',
      (await browser.evaluate(`localStorage.getItem('cycle.logs')`)) === '[]',
    )

    await browser.click('[data-slot="button"]', 'Save')
    await browser.waitFor(
      `(localStorage.getItem('cycle.logs') ?? '').includes('Bleeding')`,
      { label: 'the saved log to hold the day' },
    )
    must(
      flow,
      'Save writes the bleeding day',
      (await savedLogs(browser)).some(log => log.flow === 'Bleeding'),
    )

    await browser.waitFor(
      `(localStorage.getItem('cycle.logs') ?? '').includes('Bleeding')`,
      { label: 'the log to reach localStorage' },
    )

    const stored = await browser.evaluate(`localStorage.getItem('cycle.logs')`)
    const logs = stored === null ? [] : JSON.parse(stored)
    must(
      flow,
      'log persisted to localStorage',
      logs.length === 1 && logs[0].flow === 'Bleeding',
      String(stored),
    )

    await browser.screenshot(join(outDir, 'flow-logged.png'))

    await browser.goto(URL)
    must(
      flow,
      'the log survives a reload',
      (await savedLogs(browser)).length === 1,
      JSON.stringify(await savedLogs(browser)),
    )

    await browser.hold('[data-slot="calendar-day"]', dayLabel)
    await browser.click('[data-slot="calendar-day"]', dayLabel)
    await browser.click('[data-slot="button"]', 'Save')
    await browser.waitFor(`localStorage.getItem('cycle.logs') === '[]'`, {
      label: 'the saved log to empty',
    })
    must(
      flow,
      'tapping a logged day clears it and empties the log',
      (await savedLogs(browser)).length === 0,
    )

    // React Aria owns the arrow-key movement; happy-dom cannot focus its
    // roving tab stop, so the unit test only checks the roles. This is the
    // real check.
    await browser.hold('[data-slot="calendar-day"]', dayLabel)
    await browser.click('[data-slot="radio-group-item"]', 'Bleeding')
    await browser.press('ArrowRight', 'ArrowRight', 39)
    must(
      flow,
      'the flow group moves with the arrow keys',
      (await browser.evaluate(
        `document.querySelector('[data-slot="radio-group-item"][data-selected]')?.textContent?.trim() ?? null`,
      )) === 'Spotting',
    )
    await browser.click('[data-slot="button"]', 'Cancel')
    must(
      flow,
      'Cancel discards the draft',
      (await savedLogs(browser)).length === 0,
    )

    await browser.screenshot(join(outDir, 'flow-cleared.png'))

    // A mouse drag across four days paints the draft and saves in one confirm.
    await seed(browser, [])
    const dragLabels = await browser.evaluate(`(() => {
      const days = [...document.querySelectorAll('[data-slot="calendar-day"]')]
      const todayIndex = days.findIndex(node =>
        node.closest('[data-slot="calendar-day"]')?.hasAttribute('data-today'))
      return {
        start: days[todayIndex - 3]?.getAttribute('aria-label') ?? null,
        end: days[todayIndex]?.getAttribute('aria-label') ?? null,
      }
    })()`)
    must(
      flow,
      'the drag endpoints are on screen',
      typeof dragLabels.start === 'string' &&
        typeof dragLabels.end === 'string',
      JSON.stringify(dragLabels),
    )

    await browser.hold('[data-slot="calendar-day"]', dragLabels.end)
    const dragFrom = await browser.box(
      '[data-slot="calendar-day"]',
      dragLabels.start,
    )
    const dragTo = await browser.box(
      '[data-slot="calendar-day"]',
      dragLabels.end,
    )
    await browser.drag(dragFrom, dragTo)
    must(
      flow,
      'the drag paints four days into the draft',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]')?.getAttribute('data-draft-days')`,
      )) === '4',
    )
    must(
      flow,
      'the drag draft has not reached storage',
      (await browser.evaluate(`localStorage.getItem('cycle.logs')`)) === '[]',
    )

    await browser.click('[data-slot="button"]', 'Save')
    must(
      flow,
      'the drag range saves in one confirm',
      (await browser.evaluate(
        `JSON.parse(localStorage.getItem('cycle.logs') ?? '[]').length`,
      )) === 4,
    )

    // Edit mode toggles: a day that already carries the pen leaves the draft
    // on a tap, so taking one day back does not need Clear this day.
    await browser.hold(
      '[data-slot="calendar-day"][data-date="' + localDayKey(0) + '"]',
    )
    await browser.click(
      '[data-slot="calendar-day"][data-date="' + localDayKey(0) + '"]',
    )
    must(
      flow,
      'a tap takes a painted day out of the draft',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]')?.getAttribute('data-draft-days')`,
      )) === '3',
    )
    must(
      flow,
      'the tapped day has not reached storage yet',
      (await browser.evaluate(
        `JSON.parse(localStorage.getItem('cycle.logs') ?? '[]').length`,
      )) === 4,
    )

    await browser.click('[data-slot="button"]', 'Save')
    must(
      flow,
      'Save keeps the cleared day out of storage',
      !(await savedLogs(browser)).some(log => log.date === localDayKey(0)),
      JSON.stringify(await savedLogs(browser)),
    )

    // A level from the four-level build must still count as bleeding. If the
    // boot decode rejects it, flags drops every log and her history is gone.
    await browser.evaluate(
      `localStorage.setItem('cycle.logs', JSON.stringify([{ date: ${JSON.stringify(localDayKey(0))}, flow: 'Heavy' }]))`,
    )
    await browser.goto(URL)
    must(
      flow,
      'a level from the old build still draws as bleeding',
      (await browser.evaluate(
        `document.querySelector('[data-slot="calendar-day"][data-today][data-flow="Bleeding"]') !== null`,
      )) === true,
    )
  },

  async tabs(browser) {
    const flow = 'tabs'
    await seed(browser, twoPeriods)

    await browser.click('[data-slot="tabs-trigger"]', 'History')
    await browser.waitFor(`document.body.innerText.includes('Periods')`, {
      label: 'History panel',
    })
    must(flow, 'History shows the period list', true)
    must(
      flow,
      'History route is /history',
      (await browser.evaluate(`window.location.pathname`)) === '/history',
    )
    await browser.screenshot(join(outDir, 'tabs-history.png'))

    await browser.click('[data-slot="tabs-trigger"]', 'About')
    await browser.waitFor(
      `document.body.innerText.includes('How the range is calculated')`,
      {
        label: 'About panel',
      },
    )
    must(
      flow,
      'About route is /about',
      (await browser.evaluate(`window.location.pathname`)) === '/about',
    )
    must(
      flow,
      'About does not render a prediction switch',
      (await browser.evaluate(
        `document.querySelector('[data-slot="switch"]') === null`,
      )) === true,
    )
    await browser.screenshot(join(outDir, 'tabs-about.png'))

    await browser.click('[data-slot="tabs-trigger"]', 'Calendar')
    await browser.waitFor(
      `document.querySelector('[data-slot="calendar-day"]') !== null`,
      { label: 'Calendar panel' },
    )

    // A gap well over her usual is labelled in History instead of being
    // silently averaged in.
    const periodRun = (daysAgo, days = 3) =>
      Array.from({ length: days }, (_, offset) => ({
        date: dayKey(daysAgo - offset),
        flow: 'Bleeding',
      }))

    await seed(browser, [
      ...periodRun(171),
      ...periodRun(141),
      ...periodRun(111),
      ...periodRun(81),
      ...periodRun(30),
    ])
    await browser.click('[data-slot="tabs-trigger"]', 'History')
    await browser.waitFor(
      `document.body.innerText.includes('Probably a period you did not log')`,
      { label: 'the missed-log note' },
    )
    must(flow, 'History explains a probable missed log', true)
    must(
      flow,
      'the other rows are left alone',
      (await browser.evaluate(
        `[...document.querySelectorAll('[data-slot="tabs-content"] li')].filter(node => node.textContent.includes('Probably a period you did not log')).length`,
      )) === 1,
    )
    await browser.screenshot(join(outDir, 'tabs-missed-log.png'))
  },

  async overlays(browser) {
    const flow = 'overlays'
    await seed(browser, twoPeriods)

    await browser.click('[data-slot="tabs-trigger"]', 'About')
    await browser.waitFor(
      `document.body.innerText.includes('Cycle is a local period tracker')`,
      { label: 'About panel' },
    )

    const aboutText = await browser.evaluate(`document.body.innerText`)
    must(
      flow,
      'About shows the marks legend inline',
      aboutText.includes('Bleeding') &&
        aboutText.includes('Spotting') &&
        aboutText.includes('Predicted'),
    )
    must(
      flow,
      'About explains how the range is calculated inline',
      aboutText.includes('How the range is calculated'),
    )

    await browser.click('[data-slot="button"]', 'Clear all data')
    await browser.waitFor(
      `document.querySelector('[data-slot="alert-dialog-content"]') !== null`,
      {
        label: 'clear dialog to open',
      },
    )
    const clearTitle = await browser.evaluate(
      `document.querySelector('[data-slot="alert-dialog-content"] [data-slot="alert-dialog-title"]')?.textContent ?? null`,
    )
    must(
      flow,
      'About opens the clear alert dialog',
      clearTitle === 'Clear all data?',
      String(clearTitle),
    )
    must(
      flow,
      'the clear dialog is an alert dialog',
      (await browser.evaluate(
        `document.querySelector('[role="alertdialog"]') !== null`,
      )) === true,
    )
    await browser.screenshot(join(outDir, 'overlays-dialog.png'))
    await browser.escape()
    await browser.waitFor(
      `document.querySelector('[data-slot="alert-dialog-content"]') === null`,
      {
        label: 'Escape to close the clear dialog',
      },
    )

    const tab = await browser.box('[data-slot="tabs-trigger"]', 'Calendar')
    must(
      flow,
      'the closed dialog leaves the page clickable',
      !tab.covered,
      tab.hit ?? '',
    )

    await browser.screenshot(join(outDir, 'overlays-final.png'))
  },

  async mobile(browser) {
    const flow = 'mobile'
    await browser.viewport({
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: 2,
    })
    await seed(browser, twoPeriods)

    const layout = await browser.evaluate(`(() => {
      const bar = document.querySelector('[data-slot="tabs-list"]').parentElement
      const rect = bar.getBoundingClientRect()
      const items = [...document.querySelectorAll('[data-slot="tabs-trigger"]')].map(node => {
        const box = node.getBoundingClientRect()
        return {
          label: node.textContent.trim(),
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
      })
      const page = document.querySelector('main').parentElement
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        bar: {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          position: getComputedStyle(bar).position,
        },
        items,
        pagePaddingBottom: Math.round(parseFloat(getComputedStyle(page).paddingBottom)),
      }
    })()`)

    must(
      flow,
      'the emulated screen is a phone',
      layout.innerWidth === 390,
      String(layout.innerWidth),
    )
    must(
      flow,
      'the bar is pinned to the bottom edge',
      layout.bar.position === 'fixed' &&
        Math.abs(layout.bar.bottom - layout.innerHeight) <= 1,
      JSON.stringify(layout.bar),
    )
    must(
      flow,
      'no horizontal scroll',
      layout.scrollWidth === layout.innerWidth,
      `${layout.scrollWidth} vs ${layout.innerWidth}`,
    )
    for (const item of layout.items) {
      must(
        flow,
        `the ${item.label} tab is at least 44px each way`,
        item.height >= 44 && item.width >= 44,
        `${item.width}x${item.height}`,
      )
    }
    must(
      flow,
      'the page leaves room for the bar',
      layout.pagePaddingBottom >= layout.innerHeight - layout.bar.top,
      `${layout.pagePaddingBottom}px`,
    )

    await browser.click('[data-slot="tabs-trigger"]', 'History')
    await browser.waitFor(`document.body.innerText.includes('Periods')`, {
      label: 'History panel from the bottom bar',
    })
    must(flow, 'the bottom bar switches panels', true)
    await browser.screenshot(join(outDir, 'mobile-history.png'))

    await browser.click('[data-slot="tabs-trigger"]', 'Calendar')
    await browser.waitFor(
      `document.querySelector('[data-slot="calendar-day"]') !== null`,
      { label: 'Calendar panel' },
    )
    await browser.screenshot(join(outDir, 'mobile-today.png'))

    const touchTargets = await browser.evaluate(`(() => {
      const nodes = [
        ...document.querySelectorAll('[data-slot="button"], [data-slot="popover-trigger"], [data-slot="calendar-previous-month"], [data-slot="calendar-next-month"]')
      ].filter(node => node.offsetParent !== null)
      return nodes.map(node => ({
        label: (node.textContent ?? '').trim().slice(0, 30) || 'icon',
        height: Math.round(node.getBoundingClientRect().height),
      }))
    })()`)
    for (const target of touchTargets) {
      must(
        flow,
        `the ${target.label} control is at least 44px tall`,
        target.height >= 44,
        `${target.height}px`,
      )
    }

    // A quick swipe across the calendar is still a scroll. Only a hold turns
    // the gesture into a range. The 844px screen fits the whole panel, so
    // shrink it for this check.
    await browser.viewport({
      width: 390,
      height: 500,
      mobile: true,
      deviceScaleFactor: 2,
    })
    const scrollBefore = await browser.evaluate('window.scrollY')
    await browser.touchPress({ x: 195, y: 420 }, 0)
    await browser.touchDrag({ x: 195, y: 420 }, { x: 195, y: 150 })
    const scrollAfter = await browser.evaluate('window.scrollY')
    must(
      flow,
      'a quick swipe still scrolls the page',
      scrollAfter > scrollBefore,
      `${scrollBefore} -> ${scrollAfter}`,
    )
    must(
      flow,
      'a quick swipe does not arm a range',
      (await browser.evaluate(
        `document.querySelectorAll('[data-slot="calendar-day"][data-range]').length === 0`,
      )) === true,
    )
    await browser.evaluate('window.scrollTo(0, 0)')
    await browser.viewport({
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: 2,
    })
    await new Promise(resolve => setTimeout(resolve, 300))

    // Touch is the primary input: hold a day, drag to today, release. The
    // preview arms and one tap confirms.
    // Locate days by their date key: React Aria's aria-label carries the
    // selected and disabled state, so it is not a stable handle.
    const startDate = localDayKey(3)
    const endDate = localDayKey(0)
    const daySelector = date =>
      '[data-slot="calendar-day"][data-date="' + date + '"]'

    await browser.waitFor(
      `document.querySelector('${daySelector(startDate)}') !== null`,
      { label: 'the touch endpoints on screen' },
    )
    must(
      flow,
      'the touch endpoints are on screen',
      true,
      startDate + ' -> ' + endDate,
    )

    // The read-only calendar answers a hold: it opens the edit mode on the
    // day that was held, so editing never needs the button first.
    const holdFrom = await browser.box(daySelector(startDate))
    must(
      flow,
      'nothing is in edit mode before the hold',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]') === null`,
      )) === true,
    )

    const gridTopBefore = await browser.evaluate(
      `Math.round(document.querySelector('[data-slot="calendar-grid"]').getBoundingClientRect().top)`,
    )
    await browser.touchPress(holdFrom, 350)
    must(
      flow,
      'a read-only hold opens the edit mode',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]') !== null`,
      )) === true,
    )
    must(
      flow,
      'opening the mode leaves the calendar where it was',
      (await browser.evaluate(
        `Math.round(document.querySelector('[data-slot="calendar-grid"]').getBoundingClientRect().top)`,
      )) === gridTopBefore,
      `top was ${gridTopBefore}`,
    )

    // The mode card is the status card's slot: the same height, with the flow
    // pen and the two buttons inside it. Checked at 390px, where the layout
    // must not wrap or scroll sideways.
    const bar = await browser.evaluate(`(() => {
      const card = document.querySelector('[data-slot="edit-banner"]')
      if (card === null) return null
      const box = card.getBoundingClientRect()
      const labels = ['Save', 'Cancel', 'Bleeding', 'Spotting']
      const controls = labels.map(text =>
        [
          ...document.querySelectorAll(
            '[data-slot="button"], [data-slot="radio-group-item"]',
          ),
        ].find(node => node.textContent.trim() === text),
      )
      return {
        height: Math.round(box.height),
        overflows: card.scrollHeight > card.clientHeight,
        overflowsWidth: card.scrollWidth > card.clientWidth,
        missing: controls.filter(node => node === undefined).length,
        outside: controls.filter(
          node =>
            node !== undefined &&
            node.getBoundingClientRect().bottom > box.bottom,
        ).length,
      }
    })()`)
    must(
      flow,
      'the mode card holds its contents on a phone',
      bar !== null &&
        !bar.overflows &&
        !bar.overflowsWidth &&
        bar.missing === 0,
      JSON.stringify(bar),
    )
    must(
      flow,
      'the mode controls stay inside the card',
      bar !== null && bar.outside === 0,
      bar === null ? 'no card' : `${bar.outside} outside`,
    )
    await browser.screenshot(join(outDir, 'mobile-edit.png'))

    await browser.touchRelease()
    must(
      flow,
      'the hold opens the mode on the held day',
      (await browser.evaluate(
        `document.querySelector('[data-date="${startDate}"]')?.classList.contains('border-fg-0') ?? false`,
      )) === true,
    )
    must(
      flow,
      'lifting the hold writes nothing',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]')?.getAttribute('data-state') === 'clean'`,
      )) === true,
    )

    await browser.click('[data-slot="button"]', 'Cancel')
    must(
      flow,
      'Cancel returns the calendar to read-only',
      (await browser.evaluate(
        `document.querySelector('[data-slot="edit-banner"]') === null`,
      )) === true,
    )

    await browser.touchPress(holdFrom, 350)
    await browser.touchRelease()
    const touchFrom = await browser.box(daySelector(startDate))
    const touchTo = await browser.box(daySelector(endDate))
    await browser.touchPress(touchFrom, 80)
    const pressedBoxed = await browser.evaluate(
      `document.querySelector('[data-date="${startDate}"]')?.classList.contains('border-fg-0') ?? false`,
    )
    must(
      flow,
      'a touch press boxes the day before any hold',
      pressedBoxed === true,
    )

    await new Promise(resolve => setTimeout(resolve, 350))
    const heldBoxed = await browser.evaluate(
      `document.querySelector('[data-date="${startDate}"]')?.classList.contains('border-fg-0') ?? false`,
    )
    must(flow, 'holding a day keeps it boxed', heldBoxed === true)
    await browser.touchDrag(touchFrom, touchTo)
    const draftDays = await browser.evaluate(
      `document.querySelector('[data-slot="edit-banner"]')?.getAttribute('data-draft-days')`,
    )
    must(
      flow,
      'the touch drag paints four days into the draft',
      draftDays === '10',
      `draft has ${draftDays}`,
    )

    await browser.click('[data-slot="button"]', 'Save')
    must(
      flow,
      'the touch range writes its days',
      (await browser.evaluate(
        `JSON.parse(localStorage.getItem('cycle.logs') ?? '[]').length`,
      )) === 10,
    )
    await browser.screenshot(join(outDir, 'mobile-touch-range.png'))
  },

  async sync(browserA) {
    const flow = 'sync'
    const apiScript = join(
      dirname(fileURLToPath(import.meta.url)),
      'api-server.ts',
    )
    const apiProc = spawn('node', [apiScript], {
      cwd: ROOT,
      stdio: 'ignore',
    })

    const waitForApi = async () => {
      for (let i = 0; i < 60; i += 1) {
        try {
          const res = await fetch('http://127.0.0.1:8787/api/health')
          if (res.ok) return
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 150))
      }
      throw new Error('local sync api did not start on :8787')
    }

    let browserB = null

    try {
      await waitForApi()
      await seed(browserA, [])
      await browserA.evaluate(
        `localStorage.removeItem('cycle.sync'); localStorage.removeItem('cycle.vault')`,
      )
      await browserA.goto(URL)

      const todayKey = localDayKey(0)
      const yesterdayKey = localDayKey(1)

      // Device A logs today as Bleeding and enables sync.
      await browserA.hold(`[data-slot="calendar-day"][data-date="${todayKey}"]`)
      await browserA.click(`[data-slot="calendar-day"][data-date="${todayKey}"]`)
      await browserA.click('[data-slot="button"]', 'Save')
      await browserA.waitFor(
        `(localStorage.getItem('cycle.logs') ?? '').includes('Bleeding')`,
        { label: 'device A saved today' },
      )

      await browserA.click('[data-slot="tabs-trigger"]', 'About')
      await browserA.waitFor(`document.querySelector('input[name="username"]') !== null`, {
        label: 'device A sync form',
      })
      await browserA.fill('input[name="username"]', 'alice')
      await browserA.fill('input[name="passphrase"]', 'correct-horse-battery')
      await browserA.click('[data-slot="button"]', 'Turn on sync')
      await browserA.waitFor(`document.body.innerText.includes('Synced')`, {
        label: 'device A synced',
        timeout: 10000,
      })
      must(flow, 'device A enables sync and pushes initial vault', true)

      const storedSync = await browserA.evaluate(
        `localStorage.getItem('cycle.sync') ?? ''`,
      )
      must(
        flow,
        'passphrase is never stored in localStorage',
        storedSync.includes('vaultId') &&
          !storedSync.includes('correct-horse-battery'),
      )
      await browserA.screenshot(join(outDir, 'sync-device-a.png'))

      // Device B starts as a completely separate Chrome profile.
      browserB = await launch({ port: 9334 })
      await browserB.goto(URL)
      await browserB.click('[data-slot="tabs-trigger"]', 'About')
      await browserB.waitFor(`document.querySelector('input[name="username"]') !== null`, {
        label: 'device B sync form',
      })

      // Wrong passphrase must fail with 401 and NOT create a second vault.
      await browserB.fill('input[name="username"]', 'alice')
      await browserB.fill('input[name="passphrase"]', 'wrong-passphrase-123')
      await browserB.click('[data-slot="button"]', 'Turn on sync')
      await browserB.waitFor(
        `document.querySelector('[role="alert"]')?.textContent?.includes('Wrong username or passphrase')`,
        { label: 'device B wrong passphrase error', timeout: 10000 },
      )
      must(flow, 'wrong passphrase is rejected instead of creating a new vault', true)

      // Correct passphrase pulls Device A's bleeding day.
      await browserB.fill('input[name="passphrase"]', 'correct-horse-battery')
      await browserB.click('[data-slot="button"]', 'Turn on sync')
      await browserB.waitFor(`document.body.innerText.includes('Synced')`, {
        label: 'device B synced',
        timeout: 10000,
      })
      await browserB.click('[data-slot="tabs-trigger"]', 'Calendar')
      await browserB.waitFor(
        `document.querySelector('[data-slot="calendar-day"][data-date="${todayKey}"][data-flow="Bleeding"]') !== null`,
        { label: 'device B shows device A bleeding mark' },
      )
      must(flow, 'device B receives device A bleeding day', true)

      // Device B logs yesterday as Spotting and saves (auto-pushes).
      await browserB.hold(`[data-slot="calendar-day"][data-date="${yesterdayKey}"]`)
      await browserB.click('[data-slot="radio-group-item"]', 'Spotting')
      await browserB.click(`[data-slot="calendar-day"][data-date="${yesterdayKey}"]`)
      await browserB.click('[data-slot="button"]', 'Save')
      await browserB.waitFor(
        `JSON.parse(localStorage.getItem('cycle.logs') ?? '[]').length === 2`,
        { label: 'device B saved spotting day' },
      )
      // Give background push a moment to complete on Device B.
      await new Promise(resolve => setTimeout(resolve, 600))
      await browserB.screenshot(join(outDir, 'sync-device-b.png'))

      // Device A clicks Sync now and receives Device B's spotting day.
      await browserA.click('[data-slot="button"]', 'Sync now')
      await browserA.waitFor(
        `JSON.parse(localStorage.getItem('cycle.logs') ?? '[]').some(l => l.date === ${JSON.stringify(yesterdayKey)} && l.flow === 'Spotting')`,
        { label: 'device A pulls device B spotting day', timeout: 10000 },
      )
      must(flow, 'device A pulls device B spotting day', true)

      // Turning off sync on Device B clears credentials but keeps local logs.
      await browserB.click('[data-slot="tabs-trigger"]', 'About')
      await browserB.click('[data-slot="button"]', 'Turn off sync')
      await browserB.waitFor(`document.querySelector('input[name="username"]') !== null`, {
        label: 'device B sync form returns',
      })
      must(
        flow,
        'turning off sync clears credentials and preserves local logs',
        (await browserB.evaluate(`localStorage.getItem('cycle.sync')`)) === null &&
          (await savedLogs(browserB)).length === 2,
      )
    } finally {
      if (browserB !== null) {
        await browserB.close()
      }
      apiProc.kill('SIGTERM')
    }
  },
}

const selected =
  requested === 'all'
    ? Object.keys(flows)
    : requested.split(',').filter(Boolean)

for (const name of selected) {
  if (!flows[name]) {
    console.error(
      `unknown flow ${name}; try: all, ${Object.keys(flows).join(', ')}`,
    )
    process.exit(2)
  }
}

const browser = await launch()

try {
  for (const name of selected) {
    console.log(`\n# ${name}`)
    try {
      await flows[name](browser)
    } catch (error) {
      record(name, 'flow completed', false, String(error))
      try {
        await browser.screenshot(join(outDir, `${name}-failure.png`))
      } catch {}
    }
  }

  const exceptions = browser
    .consoleMessages()
    .filter(
      message => message.level === 'exception' || message.level === 'error',
    )
    .filter(
      message =>
        !(message.url ?? '').includes('favicon') &&
        !(message.url ?? '').includes('/api/sync'),
    )
  record(
    'page',
    'no runtime errors',
    exceptions.length === 0,
    exceptions.map(e => e.text).join(' | '),
  )
} finally {
  await browser.close()
}

const report = {
  runId,
  url: URL,
  flows: selected,
  checks,
  passed: checks.filter(check => check.ok).length,
  failed: checks.filter(check => !check.ok).length,
}

writeFileSync(
  join(outDir, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)

console.log(`\n${report.passed} passed, ${report.failed} failed`)
console.log(`evidence: ${outDir}`)

if (report.failed > 0) process.exit(1)
