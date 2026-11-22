import { cn } from '../lib/utils'

/** The app's mark: a 3×3 day grid, the middle row bleeding, the day after
 *  spotting. It mirrors what the calendar draws, so the brand and the data
 *  speak the same language. */
const DOTS = [
  { cx: 18, cy: 18, tone: 'muted' },
  { cx: 32, cy: 18, tone: 'muted' },
  { cx: 46, cy: 18, tone: 'muted' },
  { cx: 18, cy: 32, tone: 'bleeding' },
  { cx: 32, cy: 32, tone: 'bleeding' },
  { cx: 46, cy: 32, tone: 'bleeding' },
  { cx: 18, cy: 46, tone: 'spotting' },
  { cx: 32, cy: 46, tone: 'muted' },
  { cx: 46, cy: 46, tone: 'muted' },
] as const

const TONE_CLASS = {
  muted: 'fill-fg-2',
  bleeding: 'fill-bleeding',
  spotting: 'fill-spotting',
} as const

/** On a control that speaks in ink, the mark keeps its three weights as
 *  three opacities of `currentColor`. */
const MONO_OPACITY = {
  muted: 0.32,
  bleeding: 1,
  spotting: 0.6,
} as const

export const BrandMark = ({
  mono = false,
  className,
}: {
  readonly mono?: boolean
  readonly className?: string | undefined
}) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 64 64"
    className={cn('size-6 shrink-0', className)}
  >
    <rect
      width="64"
      height="64"
      rx="10"
      className={
        mono ? 'fill-transparent stroke-current' : 'fill-bg-1 stroke-line'
      }
      strokeWidth="1"
      vectorEffect="non-scaling-stroke"
    />
    {DOTS.map(dot => (
      <circle
        key={`${dot.cx}-${dot.cy}`}
        cx={dot.cx}
        cy={dot.cy}
        r={dot.tone === 'muted' ? 4.5 : 5.5}
        className={mono ? 'fill-current' : TONE_CLASS[dot.tone]}
        fillOpacity={mono ? MONO_OPACITY[dot.tone] : undefined}
      />
    ))}
  </svg>
)
