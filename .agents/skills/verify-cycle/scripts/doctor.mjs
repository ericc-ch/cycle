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

  const mountedDialogs = await browser.evaluate(
    `document.querySelectorAll('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]').length + document.querySelectorAll('[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"]').length`,
  )
  check(
    'no dialog is mounted at rest',
    mountedDialogs === 0,
    `${mountedDialogs} node(s)`,
  )

  // The flow options live inside the explicit edit mode. Holding today's cell
  // enters it without writing anything until Save, so the doctor stays read-only.
  await browser.hold('[data-slot="calendar-day"][data-today]')

  const controls = [
    ['Calendar tab', '[data-slot="tabs-trigger"]', 'Calendar'],
    ['History tab', '[data-slot="tabs-trigger"]', 'History'],
    ['calendar day', '[data-slot="calendar-day"][data-today]'],
    ['flow option', '[data-slot="radio-group-item"]', 'Bleeding'],
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
