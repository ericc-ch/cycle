import { type PlainDate, sameDay } from './domain'

/** Hold this long on a day before a finger starts dragging. A faster swipe is
 *  left alone so the page still scrolls. */
const TOUCH_LONG_PRESS_MS = 250
/** How far a finger may drift before the hold is a swipe instead. */
const TOUCH_SLOP_PX = 10

/** A finger has to hold before it drags, so a quick swipe still scrolls. A
 *  mouse and a pen drag at once. */
export type PressKind = 'finger' | 'pointer'

export type Point = { readonly x: number; readonly y: number }

export type Press = {
  readonly start: PlainDate
  /** The last day the drag reached. */
  readonly last: PlainDate
  readonly kind: PressKind
  /** The calendar was read-only when the press began, so the lift ends a mode
   *  change and not a selection. */
  readonly readOnly: boolean
  readonly origin: Point
  /** The hold completed, so a finger may drag now. */
  readonly held: boolean
  /** The drag reached another day. */
  readonly moved: boolean
}

export type Gesture =
  | { readonly phase: 'rest' }
  | { readonly phase: 'pressed'; readonly press: Press }

export type GestureEvent =
  | {
      readonly type: 'Pressed'
      readonly date: PlainDate
      readonly kind: PressKind
      readonly readOnly: boolean
      readonly origin: Point
    }
  | { readonly type: 'Held' }
  | {
      readonly type: 'Moved'
      readonly point: Point
      /** The day under the pointer, or null when it left the grid. */
      readonly date: PlainDate | null
    }
  | { readonly type: 'Lifted' }
  | { readonly type: 'Cancelled' }

/** What the view must do after a step. The machine decides; the component
 *  only performs. */
export type GestureEffect =
  | { readonly type: 'HoldTimer'; readonly delayMs: number }
  | { readonly type: 'DropHoldTimer' }
  | { readonly type: 'Haptic'; readonly preset: 'hold' | 'step' }
  | { readonly type: 'OpenEditing'; readonly date: PlainDate }
  | { readonly type: 'ToggleDay'; readonly date: PlainDate }
  | {
      readonly type: 'PaintSpan'
      readonly start: PlainDate
      readonly end: PlainDate
    }
  | { readonly type: 'EndRange' }

export type Step = {
  readonly gesture: Gesture
  readonly effects: ReadonlyArray<GestureEffect>
}

export const rest: Gesture = { phase: 'rest' }

const pressed = (press: Press): Gesture => ({ phase: 'pressed', press })

const reach = (press: Press, date: PlainDate): Step | null =>
  sameDay(date, press.last)
    ? null
    : {
        gesture: pressed({ ...press, last: date, moved: true }),
        effects: [
          { type: 'Haptic', preset: 'step' },
          { type: 'PaintSpan', start: press.start, end: date },
        ],
      }

/** The whole press gesture: one day pressed, optionally held, optionally
 *  dragged, then lifted. Nothing here touches the DOM or the clock; the view
 *  feeds it pointer events and performs the effects it returns. */
export const step = (gesture: Gesture, event: GestureEvent): Step => {
  switch (event.type) {
    case 'Pressed': {
      const startsTimer = event.readOnly || event.kind === 'finger'

      return {
        gesture: pressed({
          start: event.date,
          last: event.date,
          kind: event.kind,
          readOnly: event.readOnly,
          origin: event.origin,
          held: false,
          moved: false,
        }),
        effects: startsTimer
          ? [
              { type: 'DropHoldTimer' },
              { type: 'HoldTimer', delayMs: TOUCH_LONG_PRESS_MS },
            ]
          : [{ type: 'DropHoldTimer' }],
      }
    }

    case 'Held': {
      if (gesture.phase === 'rest') {
        return { gesture, effects: [] }
      }

      const press = gesture.press

      // A mouse in the edit mode drags at once and never armed a timer.
      if (press.held || (!press.readOnly && press.kind === 'pointer')) {
        return { gesture, effects: [] }
      }

      const held = pressed({ ...press, held: true })

      return press.readOnly
        ? {
            gesture: held,
            effects: [
              { type: 'Haptic', preset: 'hold' },
              { type: 'OpenEditing', date: press.start },
            ],
          }
        : { gesture: held, effects: [{ type: 'Haptic', preset: 'hold' }] }
    }

    case 'Moved': {
      if (gesture.phase === 'rest') {
        return { gesture, effects: [] }
      }

      const press = gesture.press

      // Before the hold, a finger that drifts is starting a swipe. Let the
      // page scroll and forget the press.
      if (press.kind === 'finger' && !press.held) {
        const drift = Math.hypot(
          event.point.x - press.origin.x,
          event.point.y - press.origin.y,
        )

        return drift > TOUCH_SLOP_PX
          ? { gesture: rest, effects: [{ type: 'DropHoldTimer' }] }
          : { gesture, effects: [] }
      }

      if (event.date === null) {
        return { gesture, effects: [] }
      }

      return reach(press, event.date) ?? { gesture, effects: [] }
    }

    case 'Lifted': {
      if (gesture.phase === 'rest') {
        return { gesture, effects: [] }
      }

      const press = gesture.press

      if (press.moved) {
        return {
          gesture: rest,
          effects: [{ type: 'DropHoldTimer' }, { type: 'EndRange' }],
        }
      }

      // A press that began read-only is a mode change: a hold opened the mode
      // on that day, and the lift must not toggle it.
      return {
        gesture: rest,
        effects: press.readOnly
          ? [{ type: 'DropHoldTimer' }]
          : [
              { type: 'DropHoldTimer' },
              { type: 'ToggleDay', date: press.start },
            ],
      }
    }

    case 'Cancelled': {
      if (gesture.phase === 'rest') {
        return { gesture, effects: [] }
      }

      return gesture.press.moved
        ? {
            gesture: rest,
            effects: [{ type: 'DropHoldTimer' }, { type: 'EndRange' }],
          }
        : { gesture: rest, effects: [{ type: 'DropHoldTimer' }] }
    }
  }
}
