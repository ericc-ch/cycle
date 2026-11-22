import type { ComponentProps, ReactNode } from 'react'
import {
  DialogTrigger as DialogTriggerPrimitive,
  type DialogTriggerProps,
  Heading,
  Popover as PopoverPrimitive,
  type PopoverProps as PopoverPrimitiveProps,
} from 'react-aria-components'

import { cn } from '../../lib/utils'
import { Button, type ButtonProps } from './button'

export type PopoverProps = DialogTriggerProps

/** The trigger and the panel share one overlay state. React Aria's
 *  `DialogTrigger` owns it; the trigger must be one of its pressable
 *  children, which is why `PopoverTrigger` is a `Button`. */
const Popover = ({ ...props }: PopoverProps) => (
  <DialogTriggerPrimitive data-slot="popover" {...props} />
)

export type PopoverTriggerProps = ButtonProps

const PopoverTrigger = ({
  className,
  variant = 'outline',
  ...props
}: PopoverTriggerProps) => (
  <Button
    data-slot="popover-trigger"
    variant={variant}
    className={className}
    {...props}
  />
)

export type PopoverContentProps = Omit<PopoverPrimitiveProps, 'className'> & {
  className?: string | undefined
  children?: ReactNode
}

const PopoverContent = ({
  className,
  children,
  placement = 'bottom start',
  offset = 8,
  ...props
}: PopoverContentProps) => (
  <PopoverPrimitive
    data-slot="popover-content"
    placement={placement}
    offset={offset}
    className={cn(
      'z-50 flex w-[min(24rem,calc(100vw-2rem))] origin-(--trigger-anchor-point) flex-col gap-snug rounded-lg border border-line bg-bg-1 p-base text-sm text-fg-0 shadow-control duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95',
      className,
    )}
    {...props}
  >
    {children}
  </PopoverPrimitive>
)

const PopoverHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="popover-header"
    className={cn('flex flex-col gap-tight text-sm', className)}
    {...props}
  />
)

const PopoverTitle = ({
  className,
  ...props
}: ComponentProps<typeof Heading>) => (
  <Heading
    data-slot="popover-title"
    className={cn('font-medium', className)}
    {...props}
  />
)

const PopoverDescription = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="popover-description"
    className={cn('text-fg-1', className)}
    {...props}
  />
)

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
