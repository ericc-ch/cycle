import type { ReactNode } from 'react'
import {
  RadioGroup as RadioGroupPrimitive,
  type RadioGroupProps as RadioGroupPrimitiveProps,
  Radio as RadioPrimitive,
  type RadioProps as RadioPrimitiveProps,
} from 'react-aria-components'

import { cn } from '../../lib/utils'

export type RadioGroupProps = Omit<
  RadioGroupPrimitiveProps,
  'className' | 'children'
> & {
  className?: string | undefined
  children?: ReactNode
}

const RadioGroup = ({ className, ...props }: RadioGroupProps) => (
  <RadioGroupPrimitive
    data-slot="radio-group"
    className={cn(
      'flex w-full gap-tight rounded-md border border-line bg-bg-0 p-tight shadow-inset',
      className,
    )}
    {...props}
  />
)

export type RadioGroupItemProps = Omit<RadioPrimitiveProps, 'className'> & {
  className?: string | undefined
}

const RadioGroupItem = ({ className, ...props }: RadioGroupItemProps) => (
  <RadioPrimitive
    data-slot="radio-group-item"
    className={({ isSelected }) =>
      cn(
        'inline-flex min-h-11 flex-1 basis-0 cursor-pointer items-center justify-center gap-tight rounded-sm border border-transparent bg-transparent px-snug text-base font-medium text-fg-1 transition-colors outline-none hover:text-fg-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
        isSelected &&
          'border-line bg-bg-1 font-semibold text-fg-0 shadow-control',
        className,
      )
    }
    {...props}
  />
)

export { RadioGroup, RadioGroupItem }
