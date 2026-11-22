import type { ComponentProps, ReactNode } from 'react'
import {
  Dialog as AlertDialogPrimitive,
  type DialogProps as AlertDialogPrimitiveProps,
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

export type AlertDialogProps = Omit<
  ModalOverlayProps,
  'className' | 'children' | 'isDismissable'
> & {
  className?: string | undefined
  children: ReactNode
}

/** A destructive confirm. `role="alertdialog"` keeps assistive technology
 *  from treating it like an ordinary dialog, and turning outside dismissal
 *  off means a tap beside a question that deletes data cannot answer it.
 *  Escape still closes, and focus starts inside. */
const AlertDialog = ({ className, children, ...props }: AlertDialogProps) => (
  <ModalOverlay
    data-slot="alert-dialog-overlay"
    isDismissable={false}
    className={cn(
      'fixed inset-0 isolate z-40 bg-halo duration-150 data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0',
      className,
    )}
    {...props}
  >
    {children}
  </ModalOverlay>
)

export type AlertDialogContentProps = Omit<
  AlertDialogPrimitiveProps,
  'className'
> & {
  className?: string | undefined
}

const AlertDialogContent = ({
  className,
  ...props
}: AlertDialogContentProps) => (
  <Modal
    className={cn(
      'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-bg-1 p-loose text-base text-fg-0 shadow-control duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95',
      className,
    )}
  >
    <AlertDialogPrimitive
      role="alertdialog"
      data-slot="alert-dialog-content"
      className="flex flex-col gap-base outline-none"
      {...props}
    />
  </Modal>
)

const AlertDialogHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="alert-dialog-header"
    className={cn('flex flex-col gap-snug', className)}
    {...props}
  />
)

const AlertDialogTitle = ({ className, ...props }: HeadingProps) => (
  <Heading
    slot="title"
    data-slot="alert-dialog-title"
    className={cn('text-lg leading-none font-semibold', className)}
    {...props}
  />
)

const AlertDialogDescription = ({ className, ...props }: TextProps) => (
  <Text
    slot="description"
    data-slot="alert-dialog-description"
    className={cn('block text-fg-1', className)}
    {...props}
  />
)

const AlertDialogFooter = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="alert-dialog-footer"
    className={cn('flex flex-wrap items-center gap-snug', className)}
    {...props}
  />
)

/** The destructive choice. `slot="close"` is what closes the dialog after the
 *  press, so the app only has to run its own action. */
const AlertDialogAction = ({
  className,
  variant = 'destructive',
  ...props
}: ButtonProps) => (
  <Button
    slot="close"
    data-slot="alert-dialog-action"
    variant={variant}
    className={className}
    {...props}
  />
)

const AlertDialogCancel = ({
  className,
  variant = 'outline',
  ...props
}: ButtonProps) => (
  <Button
    slot="close"
    data-slot="alert-dialog-cancel"
    variant={variant}
    className={className}
    {...props}
  />
)

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
}
