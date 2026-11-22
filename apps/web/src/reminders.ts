import { type Period, type PlainDate, addDays, stateFor } from './domain'

const REMINDER_STORAGE_KEY = 'cycle.reminder'
const LEAD_DAYS = 2
const REMINDER_HOUR = 9

export type StoredReminder = {
  readonly deviceToken: string
  readonly endpoint: string
}

export type ReminderSupport =
  | 'ready'
  | 'ios-install-required'
  | 'denied'
  | 'unsupported'

export type ScheduledReminder = {
  readonly date: PlainDate
  readonly at: number
}

export const computeNextReminder = (
  periods: ReadonlyArray<Period>,
  today: PlainDate,
  nowMs = Date.now(),
): ScheduledReminder | null => {
  const state = stateFor(periods, today)

  if (state._tag !== 'Expected') {
    return null
  }

  const reminderDate = addDays(state.window.low, -LEAD_DAYS)
  const at = new Date(
    reminderDate.year,
    reminderDate.month - 1,
    reminderDate.day,
    REMINDER_HOUR,
    0,
    0,
    0,
  ).getTime()

  return at > nowMs ? { date: reminderDate, at } : null
}

export const loadStoredReminder = (): StoredReminder | null => {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY)

    if (raw === null) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'deviceToken' in parsed &&
      'endpoint' in parsed &&
      typeof parsed.deviceToken === 'string' &&
      typeof parsed.endpoint === 'string' &&
      parsed.deviceToken.length >= 32 &&
      parsed.endpoint.length > 0
    ) {
      return { deviceToken: parsed.deviceToken, endpoint: parsed.endpoint }
    }

    return null
  } catch {
    return null
  }
}

const saveStoredReminder = (value: StoredReminder): void => {
  try {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(value))
  } catch {}
}

const clearStoredReminder = (): void => {
  try {
    localStorage.removeItem(REMINDER_STORAGE_KEY)
  } catch {}
}

const isIosDevice = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent

  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

const isStandaloneMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  const standalone =
    'standalone' in navigator && navigator.standalone === true

  return (
    standalone || window.matchMedia('(display-mode: standalone)').matches
  )
}

export const getReminderSupport = (): ReminderSupport => {
  if (typeof window === 'undefined') {
    return 'unsupported'
  }

  if (isIosDevice() && !isStandaloneMode()) {
    return 'ios-install-required'
  }

  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported'
  }

  if (Notification.permission === 'denied') {
    return 'denied'
  }

  return 'ready'
}

const randomDeviceToken = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

const base64UrlToUint8Array = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const buffer = new ArrayBuffer(binary.length)
  const out = new Uint8Array(buffer)

  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }

  return out
}

const putSubscription = async (
  stored: StoredReminder,
  notifyAt: number | null,
): Promise<boolean> => {
  const response = await fetch('/api/push/subscription', {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${stored.deviceToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ endpoint: stored.endpoint, notifyAt }),
  })

  return response.ok
}

export const enableReminders = async (
  notifyAt: number | null,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> => {
  try {
    const permission = await Notification.requestPermission()

    if (permission !== 'granted') {
      return {
        ok: false,
        message: 'Notification permission was not granted.',
      }
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })
    const ready = await navigator.serviceWorker.ready
    const activeRegistration = ready ?? registration

    const keyResponse = await fetch('/api/push/vapid-public-key')

    if (!keyResponse.ok) {
      return {
        ok: false,
        message: 'Reminders are not configured on the server yet.',
      }
    }

    const keyData: unknown = await keyResponse.json()
    const publicKey =
      typeof keyData === 'object' &&
      keyData !== null &&
      'publicKey' in keyData &&
      typeof keyData.publicKey === 'string'
        ? keyData.publicKey
        : ''

    if (publicKey.length === 0) {
      return { ok: false, message: 'Invalid push key from server.' }
    }

    const existingSub = await activeRegistration.pushManager.getSubscription()
    const subscription =
      existingSub ??
      (await activeRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      }))

    const previous = loadStoredReminder()
    const stored: StoredReminder = {
      deviceToken: previous?.deviceToken ?? randomDeviceToken(),
      endpoint: subscription.endpoint,
    }

    const saved = await putSubscription(stored, notifyAt)

    if (!saved) {
      return { ok: false, message: 'Could not save reminder subscription.' }
    }

    saveStoredReminder(stored)

    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not turn on reminders.' }
  }
}

export const syncReminderSchedule = async (
  notifyAt: number | null,
): Promise<void> => {
  const stored = loadStoredReminder()

  if (stored === null) {
    return
  }

  try {
    await putSubscription(stored, notifyAt)
  } catch {}
}

export const disableReminders = async (): Promise<void> => {
  const stored = loadStoredReminder()
  clearStoredReminder()

  if (stored !== null) {
    try {
      await fetch('/api/push/subscription', {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${stored.deviceToken}`,
        },
      })
    } catch {}
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const sub = await registration?.pushManager.getSubscription()
      await sub?.unsubscribe()
    }
  } catch {}
}
