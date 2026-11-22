import type { ComponentProps, ReactNode } from 'react'
import {
  Dialog as DialogPrimitive,
  type DialogProps as DialogPrimitiveProps,
  Heading,
  type HeadingProps,
  Modal,
  ModalOverlay,
  type ModalOverlayProps,
  Text,
  type TextProps,
} from 'react-aria-components'

import { cn } from '../../lib/utils'
import { Button, type ButtonProps } from './button'

export type DialogProps = Omit<
  ModalOverlayProps,
  'className' | 'children' | 'isDismissable'
> & {
  className?: string | undefined
  children: ReactNode
}

/** Controlled only: the app keeps the open dialog in its model, so there is
 *  no trigger to clone. Clicking the backdrop dismisses; Escape always does. */
const Dialog = ({ className, children, ...props }: DialogProps) => (
  <ModalOverlay
    data-slot="dialog-overlay"
    isDismissable
    className={cn(
      'fixed inset-0 isolate z-40 bg-halo duration-150 data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0',
      className,
    )}
    {...props}
  >
    {children}
  </ModalOverlay>
)

export type DialogContentProps = Omit<DialogPrimitiveProps, 'className'> & {
  className?: string | undefined
}

const DialogContent = ({ className, ...props }: DialogContentProps) => (
  <Modal
    className={cn(
      'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-bg-1 p-loose text-base text-fg-0 shadow-control duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95',
      className,
    )}
  >
    <DialogPrimitive
      data-slot="dialog-content"
      className="flex flex-col gap-base outline-none"
      {...props}
    />
  </Modal>
)

const DialogHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="dialog-header"
    className={cn('flex flex-col gap-snug', className)}
    {...props}
  />
)

const DialogTitle = ({ className, ...props }: HeadingProps) => (
  <Heading
    slot="title"
    data-slot="dialog-title"
    className={cn('text-lg leading-none font-semibold', className)}
    {...props}
  />
)

const DialogDescription = ({ className, ...props }: TextProps) => (
  <Text
    slot="description"
    data-slot="dialog-description"
    className={cn('block text-fg-1', className)}
    {...props}
  />
)

const DialogFooter = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="dialog-footer"
    className={cn('flex flex-wrap items-center gap-snug', className)}
    {...props}
  />
)

const DialogClose = ({
  className,
  variant = 'outline',
  ...props
}: ButtonProps) => (
  <Button
    slot="close"
    data-slot="dialog-close"
    variant={variant}
    className={className}
    {...props}
  />
)

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
}
