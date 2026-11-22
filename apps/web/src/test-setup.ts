import { afterEach } from 'vitest'

import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// Radix measures the trigger and content with ResizeObserver and pointer
// capture. happy-dom ships neither, so the primitives need these stubs.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = (): boolean => false
  Element.prototype.releasePointerCapture = (): void => {}
  Element.prototype.setPointerCapture = (): void => {}
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = (): void => {}
}
