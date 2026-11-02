// Read-only health check for the running app. Run this before a drive flow.
import { launch } from './cdp.mjs'

const PORT = Number(process.env.VERIFY_PORT ?? 5273)
const URL = process.env.APP_URL ?? `http://127.0.0.1:${PORT}/`

const browser = await launch()
const problems = []

const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
  if (!ok) problems.push({ name, detail })
}

try {
  const response = await fetch(URL)
  check('server answers', response.ok, `${response.status} ${URL}`)

  const html = await response.text()
  check('serves the app shell', html.includes('id="root"'))

  await browser.goto(URL)

  const rendered = await browser.evaluate(
    `document.querySelector('main') !== null`,
  )
  check('renders main', rendered)

  const dialogs = await browser.evaluate(`(() => {
    return [...document.querySelectorAll('dialog')].map(dialog => {
      const style = getComputedStyle(dialog)
      const rect = dialog.getBoundingClientRect()
      return {
        id: dialog.id,
        open: dialog.open,
        display: style.display,
        area: rect.width * rect.height,
      }
    })
  })()`)

  for (const dialog of dialogs) {
    if (dialog.open) continue
    check(
      `closed dialog ${dialog.id} is hidden`,
      dialog.display === 'none' && dialog.area === 0,
      `display=${dialog.display} area=${Math.round(dialog.area)}`,
    )
  }

  const controls = [
    ['Today tab', '[data-slot="tabs-trigger"]', 'Today'],
    ['History tab', '[data-slot="tabs-trigger"]', 'History'],
    ['calendar day', '[data-slot="calendar-cell"][data-today] button'],
    ['flow option', '[role="radio"]', 'Light'],
  ]

  for (const [label, selector, text] of controls) {
    const box = await browser.box(selector, text ?? null)
    if (!box) {
      check(`${label} is present`, false, selector)
      continue
    }
    check(
      `${label} is clickable`,
      !box.covered,
      box.covered ? `covered by ${box.hit}` : '',
    )
  }

  const exceptions = browser
    .consoleMessages()
    .filter(
      message => message.level === 'exception' || message.level === 'error',
    )
    .filter(message => !(message.url ?? '').includes('favicon'))
  check(
    'no page errors',
    exceptions.length === 0,
    exceptions.map(e => e.text).join(' | '),
  )
} catch (error) {
  check('doctor ran', false, String(error))
} finally {
  await browser.close()
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s)`)
  process.exit(1)
}

console.log('\nall checks passed')
