import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'cycle.theme'

const systemTheme = (): Theme =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

const readStoredTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)

    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

const applyThemeMeta = (stored: Theme | null): void => {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="color-scheme"]',
  )

  if (meta === null) {
    return
  }

  const nextContent = stored ?? 'light dark'

  if (meta.content === nextContent) {
    return
  }

  const root = document.documentElement
  root.setAttribute('data-theme-switching', '')
  meta.content = nextContent
  void document.body.offsetHeight
  root.removeAttribute('data-theme-switching')
}

export const resolvedTheme = (): Theme => readStoredTheme() ?? systemTheme()

export const toggleTheme = (): Theme => {
  const next: Theme = resolvedTheme() === 'dark' ? 'light' : 'dark'
  const stored: Theme | null = next === systemTheme() ? null : next

  try {
    if (stored === null) {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, stored)
    }
  } catch {}

  applyThemeMeta(stored)

  return next
}

export const useTheme = (): {
  readonly theme: Theme
  readonly toggle: () => void
} => {
  const [theme, setTheme] = useState<Theme>(resolvedTheme)

  useEffect(() => {
    const sync = () => {
      const stored = readStoredTheme()
      applyThemeMeta(stored)
      setTheme(stored ?? systemTheme())
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) {
        sync()
      }
    }

    window.addEventListener('storage', onStorage)

    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null

    media?.addEventListener('change', sync)

    return () => {
      window.removeEventListener('storage', onStorage)
      media?.removeEventListener('change', sync)
    }
  }, [])

  const toggle = () => {
    setTheme(toggleTheme())
  }

  return { theme, toggle }
}
