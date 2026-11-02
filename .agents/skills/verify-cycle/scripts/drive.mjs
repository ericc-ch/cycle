// Drive the app through real user paths and capture evidence.
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

const statusText = browser =>
  browser.evaluate(`document.querySelector('[role="status"]')?.innerText ?? ''`)

const dialogOpen = browser =>
  browser.evaluate(`document.querySelector('dialog[open]') !== null`)

const dayKey = daysAgo => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

// Two past periods, so the app is in the predicted state with History rows.
// This is setup, not the path under test: the period derivation itself is
// covered by packages/domain tests.
const twoPeriods = [
  { date: dayKey(40), flow: 'Medium' },
  { date: dayKey(39), flow: 'Heavy' },
  { date: dayKey(38), flow: 'Light' },
  { date: dayKey(10), flow: 'Medium' },
  { date: dayKey(9), flow: 'Heavy' },
  { date: dayKey(8), flow: 'Light' },
]

const seed = async (browser, logs) => {
  await browser.goto(URL)
  await browser.evaluate(
    `localStorage.setItem('cycle.logs', ${JSON.stringify(JSON.stringify(logs))})`,
  )
  await browser.goto(URL)
}

const flows = {
  async clicks(browser) {
    const flow = 'clicks'
    await seed(browser, twoPeriods)

    const hits = await browser.evaluate(`(() => {
      const pick = (selector, text) => [...document.querySelectorAll(selector)].find(node =>
        text === undefined ||
        (node.textContent ?? '').trim() === text ||
        node.getAttribute('aria-label') === text)
      const controls = [
        ['Data menu', '[data-slot="dropdown-menu-trigger"]'],
        ['Today tab', '[data-slot="tabs-trigger"]', 'Today'],
        ['History tab', '[data-slot="tabs-trigger"]', 'History'],
        ['About tab', '[data-slot="tabs-trigger"]', 'About'],
        ['legend trigger', '[data-slot="popover-trigger"]'],
        ['confidence trigger', '[data-slot="tooltip-trigger"]'],
      ]
      for (const cell of document.querySelectorAll('button[aria-pressed]')) {
        controls.push(['day ' + cell.getAttribute('aria-label'), 'button[aria-pressed]', cell.getAttribute('aria-label')])
      }
      for (const radio of document.querySelectorAll('[role="radio"]')) {
        controls.push(['flow ' + (radio.textContent ?? '').trim(), '[role="radio"]', (radio.textContent ?? '').trim()])
      }
      return controls.map(([label, selector, text]) => {
        const node = pick(selector, text)
        if (!node) return { label, present: false }
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

    const closed = await browser.evaluate(`(() => {
      return [...document.querySelectorAll('dialog')]
        .filter(dialog => !dialog.open)
        .map(dialog => {
          const style = getComputedStyle(dialog)
          const rect = dialog.getBoundingClientRect()
          return { id: dialog.id, display: style.display, area: rect.width * rect.height }
        })
    })()`)

    for (const dialog of closed) {
      must(
        flow,
        `closed dialog ${dialog.id} is hidden`,
        dialog.display === 'none' && dialog.area === 0,
        `display=${dialog.display} area=${Math.round(dialog.area)}`,
      )
    }

    await browser.screenshot(join(outDir, 'clicks.png'))
  },

  async flow(browser) {
    const flow = 'flow'
    await seed(browser, [])

    const dayLabel = await browser.evaluate(`(() => {
      const cells = [...document.querySelectorAll('button[aria-pressed]')]
      return cells.at(-1)?.getAttribute('aria-label') ?? null
    })()`)

    must(
      flow,
      'today cell found',
      typeof dayLabel === 'string',
      String(dayLabel),
    )
    await browser.click('button[aria-pressed]', dayLabel)

    const checked = await browser.evaluate(
      `document.querySelector('[role="radio"][data-state="checked"]')?.textContent?.trim() ?? null`,
    )
    must(
      flow,
      'nothing logged before the first tap',
      checked === 'None',
      String(checked),
    )

    await browser.click('[role="radio"]', 'Light')
    await browser.waitFor(
      `(document.querySelector('[role="status"]')?.innerText ?? '').includes('Bleeding · light')`,
      { label: 'status to report bleeding' },
    )
    must(
      flow,
      'status reports the bleeding day',
      (await statusText(browser)).includes('Bleeding · light'),
    )

    await browser.waitFor(
      `(localStorage.getItem('cycle.logs') ?? '').includes('Light')`,
      { label: 'the log to reach localStorage' },
    )

    const stored = await browser.evaluate(`localStorage.getItem('cycle.logs')`)
    const logs = stored === null ? [] : JSON.parse(stored)
    must(
      flow,
      'log persisted to localStorage',
      logs.length === 1 && logs[0].flow === 'Light',
      String(stored),
    )

    await browser.screenshot(join(outDir, 'flow-logged.png'))

    await browser.goto(URL)
    must(
      flow,
      'the log survives a reload',
      (await statusText(browser)).includes('Bleeding · light'),
      await statusText(browser),
    )

    await browser.click('[role="radio"]', 'None')
    await browser.waitFor(
      `(document.querySelector('[role="status"]')?.innerText ?? '').includes('Nothing logged')`,
      { label: 'status to return to empty' },
    )
    must(
      flow,
      'clearing the day empties the log',
      (await statusText(browser)).includes('Nothing logged'),
    )

    await browser.screenshot(join(outDir, 'flow-cleared.png'))
  },

  async tabs(browser) {
    const flow = 'tabs'
    await seed(browser, twoPeriods)

    must(
      flow,
      'the seeded state predicts',
      (await statusText(browser)).includes('Period expected'),
      await statusText(browser),
    )

    await browser.click('[data-slot="tabs-trigger"]', 'History')
    await browser.waitFor(`document.body.innerText.includes('Periods')`, {
      label: 'History panel',
    })
    must(flow, 'History shows the period list', true)
    await browser.screenshot(join(outDir, 'tabs-history.png'))

    await browser.click('[data-slot="tabs-trigger"]', 'About')
    await browser.waitFor(
      `document.querySelector('[data-slot="switch"]') !== null`,
      {
        label: 'About panel switch',
      },
    )
    must(
      flow,
      'About shows the prediction switch on',
      (await browser.evaluate(
        `document.querySelector('[data-slot="switch"]')?.dataset.state`,
      )) === 'checked',
    )

    await browser.click('[data-slot="switch"]')
    must(
      flow,
      'the switch turns prediction off',
      (await browser.evaluate(
        `document.querySelector('[data-slot="switch"]')?.dataset.state`,
      )) === 'unchecked',
    )
    await browser.screenshot(join(outDir, 'tabs-about.png'))

    await browser.click('[data-slot="tabs-trigger"]', 'Today')
    await browser.waitFor(
      `document.body.innerText.includes('Prediction is off.')`,
      {
        label: 'Today panel to honour the switch',
      },
    )
    must(flow, 'Today reports that prediction is off', true)

    await browser.goto(URL)
    await browser.click('[data-slot="tabs-trigger"]', 'About')
    must(
      flow,
      'prediction resets on reload',
      (await browser.evaluate(
        `document.querySelector('[data-slot="switch"]')?.dataset.state`,
      )) === 'checked',
    )
  },

  async overlays(browser) {
    const flow = 'overlays'
    await seed(browser, twoPeriods)

    await browser.click('[data-slot="dropdown-menu-trigger"]')
    await browser.waitFor(
      `document.querySelectorAll('[role="menuitem"]').length === 2`,
      { label: 'Data menu items' },
    )
    must(flow, 'the Data menu lists both actions', true)
    await browser.screenshot(join(outDir, 'overlays-menu.png'))

    await browser.click('[role="menuitem"]', 'How this works')
    await browser.waitFor(`document.querySelector('dialog[open]') !== null`, {
      label: 'explainer dialog to open',
    })
    const title = await browser.evaluate(
      `document.querySelector('dialog[open] [data-slot="dialog-title"]')?.textContent ?? null`,
    )
    must(
      flow,
      'the explainer dialog names itself',
      title === 'How the range is calculated',
      String(title),
    )
    await browser.screenshot(join(outDir, 'overlays-dialog.png'))

    await browser.escape()
    await browser.waitFor(`document.querySelector('dialog[open]') === null`, {
      label: 'Escape to close the dialog',
    })
    must(flow, 'Escape closes the dialog', !(await dialogOpen(browser)))

    const tab = await browser.box('[data-slot="tabs-trigger"]', 'Today')
    must(
      flow,
      'the closed dialog leaves the page clickable',
      !tab.covered,
      tab.hit ?? '',
    )

    await browser.click('[data-slot="popover-trigger"]')
    await browser.waitFor(
      `document.querySelector('[data-slot="popover-content"]') !== null`,
      { label: 'legend popover', timeout: 3000 },
    )
    must(
      flow,
      'the legend explains the ink levels',
      (
        await browser.evaluate(
          `document.querySelector('[data-slot="popover-content"]')?.innerText ?? ''`,
        )
      ).includes('Ink, not colour'),
    )
    await browser.screenshot(join(outDir, 'overlays-popover.png'))

    await browser.escape()
    let closed = false
    try {
      await browser.waitFor(
        `document.querySelector('[data-slot="popover-content"]') === null`,
        { label: 'Escape to close the popover', timeout: 1500 },
      )
      closed = true
    } catch {
      await browser.click('[data-slot="popover-trigger"]')
      closed =
        (await browser.evaluate(
          `document.querySelector('[data-slot="popover-content"]') === null`,
        )) === true
    }
    must(flow, 'the legend closes again', closed)

    await browser.hover('[data-slot="tooltip-trigger"]')
    await browser.waitFor(
      `document.querySelector('[data-slot="tooltip-content"]') !== null`,
      { label: 'confidence tooltip', timeout: 4000 },
    )
    must(
      flow,
      'hovering the confidence word explains it',
      (
        await browser.evaluate(
          `document.querySelector('[data-slot="tooltip-content"]')?.innerText ?? ''`,
        )
      ).includes('Fewer than three logged cycles'),
    )
    await browser.screenshot(join(outDir, 'overlays-tooltip.png'))

    await browser.move(8, 8)
    await browser.waitFor(
      `document.querySelector('[data-slot="tooltip-content"]') === null`,
      { label: 'tooltip to hide', timeout: 3000 },
    )
    must(flow, 'the tooltip hides when the pointer leaves', true)

    await browser.screenshot(join(outDir, 'overlays-final.png'))
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
    .filter(message => !(message.url ?? '').includes('favicon'))
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
