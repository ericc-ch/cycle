import { type VariantProps, cva } from 'class-variance-authority'
import {
  Button as ButtonPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
} from 'react-aria-components'

import { cn } from '../../lib/utils'

/**
 * shadcn `aria-nova` button over React Aria's `ButtonPrimitive`, keeping a
 * 44px minimum touch target (`min-h-11`) for mobile-first ergonomics.
 */
export const buttonVariants = cva(
  "group/button inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-snug self-start rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap [text-box:trim-both_cap_alphabetic] transition-all outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-line bg-bg-1 text-fg-0 shadow-control hover:border-accent/50 hover:bg-bg-2 active:shadow-inset aria-expanded:bg-bg-2',
        primary:
          'bg-accent text-accent-fg shadow-control hover:bg-accent/90 active:shadow-inset',
        outline:
          'border-line bg-bg-1 text-fg-0 shadow-control hover:border-accent/50 hover:bg-bg-2 active:shadow-inset aria-expanded:bg-bg-2',
        secondary:
          'border-line bg-bg-2 text-fg-0 shadow-surface hover:bg-bg-2/80 aria-expanded:bg-bg-2',
        ghost:
          'bg-transparent text-fg-1 hover:bg-bg-1 hover:text-fg-0 aria-expanded:bg-bg-1 aria-expanded:text-fg-0',
        destructive:
          'border-danger/30 bg-danger/15 text-danger shadow-control hover:bg-danger/25',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-base py-snug',
        xs: "gap-tight px-snug text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "gap-tight px-base text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'px-loose text-base',
        icon: 'size-11 p-0',
        'icon-xs': "size-11 p-0 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-11 p-0',
        'icon-lg': 'size-12 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = Omit<
  ButtonPrimitiveProps,
  'className' | 'isDisabled'
> &
  VariantProps<typeof buttonVariants> & {
    className?: string | undefined
    /** React Aria spells it `isDisabled`; the app keeps the DOM name. */
    disabled?: boolean | undefined
  }

export const Button = ({
  className,
  variant = 'default',
  size = 'default',
  disabled,
  ...props
}: ButtonProps) => (
  <ButtonPrimitive
    data-slot="button"
    data-variant={variant}
    data-size={size}
    isDisabled={disabled ?? false}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
)
