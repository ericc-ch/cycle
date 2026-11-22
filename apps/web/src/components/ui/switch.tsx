import {
  Switch as SwitchPrimitive,
  type SwitchProps as SwitchPrimitiveProps,
} from 'react-aria-components'

import { cn } from '../../lib/utils'

export type SwitchProps = Omit<
  SwitchPrimitiveProps,
  'className' | 'children'
> & {
  className?: string | undefined
}

/** Track and thumb in one control. React Aria owns the label, the hidden
 *  checkbox and the keyboard toggle; the thumb is drawn here so the checked
 *  state can move it without a CSS sibling selector. The 18×34 track stays
 *  the visual size and the pseudo-element expands the hit area. */
export const Switch = ({ className, ...props }: SwitchProps) => (
  <SwitchPrimitive
    data-slot="switch"
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-sm border border-line bg-bg-1 p-0.5 shadow-inset transition-colors outline-none before:absolute before:-inset-3.5 before:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      className,
    )}
    {...props}
  >
    {({ isSelected }) => (
      <span
        data-slot="switch-thumb"
        data-selected={isSelected || undefined}
        className={cn(
          'block h-3.5 w-3.5 rounded-xs transition-all',
          isSelected
            ? 'ml-auto bg-accent shadow-control'
            : 'bg-fg-2',
        )}
      />
    )}
  </SwitchPrimitive>
)
