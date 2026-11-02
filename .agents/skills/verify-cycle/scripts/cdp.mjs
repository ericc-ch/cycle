// Minimal Chrome DevTools Protocol client. No Playwright, no dependencies.
// Launch, navigate, read the page, dispatch real input, screenshot.
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const findChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH

  for (const name of ['google-chrome-dev', 'google-chrome', 'chromium']) {
    for (const dir of (process.env.PATH ?? '').split(':')) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }

  const store = '/nix/store'
  try {
    const match = readdirSync(store)
      .filter(
        entry =>
          entry.includes('google-chrome-dev') || entry.includes('chromium'),
      )
      .sort()
      .reverse()
      .map(entry => join(store, entry, 'bin'))
      .flatMap(bin => {
        try {
          return readdirSync(bin)
            .filter(file => file.startsWith('google-chrome'))
            .map(file => join(bin, file))
        } catch {
          return []
        }
      })
    if (match[0]) return match[0]
  } catch {}

  throw new Error('no chrome binary found; set CHROME_PATH')
}

export const launch = async ({ port = 9333 } = {}) => {
  const chrome = findChrome()
  const profile = mkdtempSync(join(tmpdir(), 'verify-cycle-'))
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let version
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      version = await (
        await fetch(`http://127.0.0.1:${port}/json/version`)
      ).json()
      break
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  if (!version) {
    child.kill('SIGKILL')
    throw new Error('chrome did not expose the debugging port')
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let nextId = 0
  const pending = new Map()
  const events = []

  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined) {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
      return
    }
    events.push(message)
  })

  const send = (method, params = {}, sessionId) =>
    new Promise(resolve => {
      const id = (nextId += 1)
      pending.set(id, resolve)
      ws.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      )
    })

  const target = await send('Target.createTarget', { url: 'about:blank' })
  const attached = await send('Target.attachToTarget', {
    targetId: target.result.targetId,
    flatten: true,
  })
  const sessionId = attached.result.sessionId
  const session = (method, params) => send(method, params, sessionId)

  await session('Page.enable')
  await session('Runtime.enable')
  await session('Log.enable')

  const evaluate = async expression => {
    const result = await session('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.result?.exceptionDetails) {
      throw new Error(
        result.result.exceptionDetails.exception?.description ??
          result.result.exceptionDetails.text,
      )
    }
    return result.result?.result?.value
  }

  const waitFor = async (
    expression,
    { timeout = 5000, label = expression } = {},
  ) => {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return true
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`timed out waiting for ${label}`)
  }

  const goto = async (url, settle = 800) => {
    await session('Page.navigate', { url })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await evaluate('document.readyState')) === 'complete') break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await waitFor(`document.querySelector('main') !== null`, {
      label: 'main after navigation',
      timeout: 20000,
    })
    await new Promise(resolve => setTimeout(resolve, settle))
  }

  // A clickable handle: prefer data-slot, fall back to accessible text.
  const find = (selector, text) =>
    `(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]
      const target = ${JSON.stringify(text)} === null
        ? nodes[0]
        : nodes.find(node =>
            (node.textContent ?? '').trim() === ${JSON.stringify(text)} ||
            node.getAttribute('aria-label') === ${JSON.stringify(text)})
      if (!target) return null
      const rect = target.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const hit = document.elementFromPoint(x, y)
      return {
        x, y,
        text: (target.textContent ?? '').trim().slice(0, 60),
        tag: target.tagName,
        covered: !(hit === target || target.contains(hit)),
        hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null,
      }
    })()`

  const box = (selector, text = null) => evaluate(find(selector, text))

  const mouse = async (type, x, y, extra = {}) => {
    await session('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      clickCount: type === 'mouseMoved' ? 0 : 1,
      ...extra,
    })
  }

  const click = async (selector, text = null) => {
    const target = await box(selector, text)
    if (!target) {
      throw new Error(
        `no element ${selector} with text ${JSON.stringify(text)}`,
      )
    }
    await mouse('mouseMoved', target.x, target.y)
    await mouse('mousePressed', target.x, target.y, { buttons: 1 })
    await mouse('mouseReleased', target.x, target.y, { buttons: 0 })
    await new Promise(resolve => setTimeout(resolve, 250))
    return target
  }

  const hover = async (selector, text = null) => {
    const target = await box(selector, text)
    if (!target) {
      throw new Error(`no element ${selector} to hover`)
    }
    await mouse('mouseMoved', target.x, target.y)
    return target
  }

  const move = async (x, y) => {
    await mouse('mouseMoved', x, y)
    await new Promise(resolve => setTimeout(resolve, 150))
  }

  const press = async (key, code, windowsVirtualKeyCode) => {
    await session('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    })
    await session('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    })
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  const escape = () => press('Escape', 'Escape', 27)

  const screenshot = async path => {
    const shot = await session('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(shot.result.data, 'base64'))
  }

  // Resize the emulated screen. `mobile: true` makes the meta viewport
  // apply, so CSS px match the device width instead of a 980px layout.
  const viewport = async ({
    width,
    height,
    mobile = false,
    deviceScaleFactor = 1,
  }) => {
    await session('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      mobile,
      deviceScaleFactor,
      screenWidth: width,
      screenHeight: height,
    })
    await session('Emulation.setTouchEmulationEnabled', { enabled: mobile })
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  const consoleMessages = () =>
    events
      .filter(
        event =>
          event.method === 'Runtime.consoleAPICalled' ||
          event.method === 'Runtime.exceptionThrown' ||
          event.method === 'Log.entryAdded',
      )
      .map(event => {
        if (event.method === 'Runtime.exceptionThrown') {
          return {
            level: 'exception',
            text:
              event.params.exceptionDetails.exception?.description ??
              event.params.exceptionDetails.text,
          }
        }
        if (event.method === 'Log.entryAdded') {
          return {
            level: event.params.entry.level,
            text: event.params.entry.text,
            url: event.params.entry.url,
          }
        }
        return {
          level: event.params.type,
          text: event.params.args
            .map(arg => arg.value ?? arg.description ?? '')
            .join(' '),
        }
      })

  const close = async () => {
    try {
      await session('Target.closeTarget', { targetId: target.result.targetId })
    } catch {}
    ws.close()
    child.kill('SIGKILL')
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
  }

  return {
    evaluate,
    waitFor,
    goto,
    box,
    click,
    hover,
    move,
    press,
    escape,
    screenshot,
    viewport,
    consoleMessages,
    close,
  }
}
