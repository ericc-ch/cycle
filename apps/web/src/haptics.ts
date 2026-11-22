import { type HapticInput, WebHaptics } from 'web-haptics'

let instance: WebHaptics | null = null

/** Fire and forget. A device without a motor, or a library that throws while
 *  setting itself up, must never take a tap down with it. */
const trigger = (pattern: HapticInput): void => {
  try {
    instance ??= new WebHaptics()
    void instance.trigger(pattern).catch(() => undefined)
  } catch {
    // Silence is a valid answer.
  }
}

/** Named haptics, one per moment. `selection` is a detent, `heavy` marks the
 *  long-press that arms a drag, `success` closes a save. Devices without a
 *  motor stay silent, and iOS 26.5+ is silent everywhere, so the UI must read
 *  without them. */
export const haptics = {
  start: (): void => trigger('medium'),
  hold: (): void => trigger('heavy'),
  step: (): void => trigger('medium'),
  save: (): void => trigger('success'),
  cancel: (): void => trigger('nudge'),
}
