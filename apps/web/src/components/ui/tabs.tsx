import type { ReactNode } from 'react'
import {
  TabList as TabListPrimitive,
  type TabListProps as TabListPrimitiveProps,
  TabPanel as TabPanelPrimitive,
  type TabPanelProps as TabPanelPrimitiveProps,
  Tab as TabPrimitive,
  type TabProps as TabPrimitiveProps,
  Tabs as TabsPrimitive,
  type TabsProps as TabsPrimitiveProps,
} from 'react-aria-components'

import { type VariantProps, cva } from 'class-variance-authority'

import { cn } from '../../lib/utils'

export type TabsProps = Omit<TabsPrimitiveProps, 'className'> & {
  className?: string | undefined
  children?: ReactNode
}

const Tabs = ({ className, ...props }: TabsProps) => (
  <TabsPrimitive
    data-slot="tabs"
    className={cn('group/tabs flex flex-col data-horizontal:flex-col', className)}
    {...props}
  />
)

const tabsListVariants = cva(
  'group/tabs-list mx-auto flex w-full max-w-measure items-center justify-center text-fg-1',
  {
    variants: {
      variant: {
        default: 'gap-snug bg-transparent py-snug',
        line: 'gap-tight rounded-none bg-transparent p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type TabsListProps = Omit<TabListPrimitiveProps<object>, 'className'> &
  VariantProps<typeof tabsListVariants> & {
    className?: string | undefined
  }

/** The row. The bar itself is page layout, owned by the app. */
const TabsList = ({
  className,
  variant = 'default',
  ...props
}: TabsListProps) => (
  <TabListPrimitive
    data-slot="tabs-list"
    data-variant={variant}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
)

export type TabsTriggerProps = Omit<TabPrimitiveProps, 'className'> & {
  className?: string | undefined
}

const TabsTrigger = ({ className, ...props }: TabsTriggerProps) => (
  <TabPrimitive
    data-slot="tabs-trigger"
    className={({ isSelected }) =>
      cn(
        "relative inline-flex min-h-12 flex-1 basis-0 cursor-pointer flex-col items-center justify-center gap-tight rounded-md border border-transparent bg-transparent px-snug py-tight text-xs leading-none font-medium whitespace-nowrap text-fg-1 [text-box:trim-both_cap_alphabetic] transition-all outline-none select-none hover:bg-bg-2/60 hover:text-fg-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        isSelected &&
          'border-accent/35 bg-accent-soft font-semibold text-fg-0 shadow-control [&_svg]:text-accent',
        className,
      )
    }
    {...props}
  />
)

export type TabsContentProps = Omit<TabPanelPrimitiveProps, 'className'> & {
  className?: string | undefined
}

const TabsContent = ({ className, ...props }: TabsContentProps) => (
  <TabPanelPrimitive
    data-slot="tabs-content"
    className={cn('flex-1 outline-none', className)}
    {...props}
  />
)

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants }
