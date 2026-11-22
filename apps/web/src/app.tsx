import {
  type Dispatch,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { I18nProvider, type Key } from 'react-aria-components'

import { sameSnapshot } from '@cycle/sync'

import { useAtomSet, useAtomValue } from '@effect/atom-react'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { HistoryIcon, InfoIcon, Trash2Icon } from 'lucide-react'

import { BrandMark } from './components/brand-mark'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './components/ui'
import { type Period, todayPlainDate } from './domain'
import { plural } from './format'
import {
  type Action,
  type DialogName,
  type Model,
  type Tab,
  dispatchAtom,
  modelAtom,
  periodsAtom,
  tabs,
} from './state'
import { loadSyncCredentials, runSync } from './sync'
import { AboutView } from './views/about'
import { HistoryView } from './views/history'
import { TodayView } from './views/today'

const isTab = (value: string): value is Tab =>
  value === 'Calendar' || value === 'History' || value === 'About'

const tabIcon = (tab: Tab) => {
  switch (tab) {
    case 'Calendar':
      return <BrandMark mono className="size-5" />
    case 'History':
      return <HistoryIcon aria-hidden="true" />
    case 'About':
      return <InfoIcon aria-hidden="true" />
  }
}

const pathForTab = (tab: Tab): '/' | '/history' | '/about' => {
  switch (tab) {
    case 'Calendar':
      return '/'
    case 'History':
      return '/history'
    case 'About':
      return '/about'
  }
}

const tabForPath = (pathname: string): Tab => {
  if (pathname === '/history') {
    return 'History'
  }

  return pathname === '/about' ? 'About' : 'Calendar'
}

export type AppShellProps = {
  readonly model: Model
  readonly periods: ReadonlyArray<Period>
  readonly dispatch: Dispatch<Action>
}

const useAppState = () => {
  const model = useAtomValue(modelAtom)
  const periods = useAtomValue(periodsAtom)
  const setAction = useAtomSet(dispatchAtom)
  const dispatch: Dispatch<Action> = action => setAction(action)

  return { model, periods, dispatch }
}

const TodayRoute = () => {
  const { model, periods, dispatch } = useAppState()

  return <TodayView model={model} periods={periods} dispatch={dispatch} />
}

const HistoryRoute = () => {
  const { model, periods } = useAppState()

  return <HistoryView logs={model.logs} periods={periods} />
}

const AboutRoute = () => {
  const { model, dispatch } = useAppState()

  return <AboutView model={model} dispatch={dispatch} />
}

const RootRoute = () => {
  const { model, periods, dispatch } = useAppState()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const activeTab = tabForPath(pathname)

  const vaultRef = useRef(model.vault)
  const editingRef = useRef(model.draft !== null)
  const mountedRef = useRef(true)
  const syncingRef = useRef(false)
  const pendingRef = useRef(false)
  const lastSyncedVaultRef = useRef<typeof model.vault | null>(null)
  const syncEnabled = model.sync.status === 'ready'
  const isEditing = model.draft !== null

  vaultRef.current = model.vault
  editingRef.current = isEditing

  const triggerSync = useCallback(async () => {
    const credentials = loadSyncCredentials()

    if (credentials === null || editingRef.current) {
      return
    }

    if (syncingRef.current) {
      pendingRef.current = true
      return
    }

    syncingRef.current = true
    dispatch({ type: 'SyncStarted' })

    const outcome = await runSync(credentials, vaultRef.current)

    syncingRef.current = false

    if (mountedRef.current) {
      if (outcome.ok) {
        lastSyncedVaultRef.current = outcome.snapshot
        dispatch({
          type: 'SyncSucceeded',
          username: credentials.username,
          snapshot: outcome.snapshot,
        })
      } else {
        dispatch({ type: 'SyncFailed', message: outcome.message })
      }
    }

    if (pendingRef.current) {
      pendingRef.current = false

      if (mountedRef.current && loadSyncCredentials() !== null) {
        void triggerSync()
      }
    }
  }, [dispatch])

  useEffect(() => {
    mountedRef.current = true

    const refreshToday = () => {
      if (document.visibilityState === 'visible') {
        dispatch({ type: 'RefreshedToday', today: todayPlainDate() })
      }
    }

    document.addEventListener('visibilitychange', refreshToday)
    window.addEventListener('focus', refreshToday)

    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', refreshToday)
      window.removeEventListener('focus', refreshToday)
    }
  }, [dispatch])

  useEffect(() => {
    if (!syncEnabled) {
      lastSyncedVaultRef.current = null
      pendingRef.current = false
      return
    }

    const onWake = () => {
      if (document.visibilityState === 'visible') {
        void triggerSync()
      }
    }
    const onOnline = () => void triggerSync()

    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onOnline)

    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onOnline)
    }
  }, [syncEnabled, triggerSync])

  useEffect(() => {
    if (!syncEnabled || isEditing) {
      return
    }

    if (
      lastSyncedVaultRef.current === null ||
      !sameSnapshot(lastSyncedVaultRef.current, model.vault)
    ) {
      void triggerSync()
    }
  }, [syncEnabled, isEditing, model.vault, triggerSync])

  const onTabChange = (key: Key) => {
    const tab = String(key)

    if (isTab(tab)) {
      dispatch({ type: 'SetTab', tab })
      void navigate({ to: pathForTab(tab) })
    }
  }

  return (
    <AppShell
      model={{ ...model, tab: activeTab }}
      periods={periods}
      dispatch={dispatch}
      onTabChange={onTabChange}
    >
      <Outlet />
    </AppShell>
  )
}

const rootRoute = createRootRoute({
  component: RootRoute,
})

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TodayRoute,
})

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: HistoryRoute,
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutRoute,
})

const routeTree = rootRoute.addChildren([todayRoute, historyRoute, aboutRoute])

export const router = createRouter({
  routeTree,
  defaultPendingMinMs: 0,
})

void router.load()

export const AppShell = ({
  model,
  periods,
  dispatch,
  onTabChange,
  children,
}: AppShellProps & {
  readonly onTabChange?: (key: Key) => void
  readonly children?: ReactNode
}) => {
  const handleTabChange = (key: Key) => {
    if (onTabChange !== undefined) {
      onTabChange(key)
      return
    }

    const tab = String(key)

    if (isTab(tab)) {
      dispatch({ type: 'SetTab', tab })
    }
  }

  const onDialogChange =
    (dialog: DialogName) =>
    (open: boolean): void => {
      dispatch(
        open ? { type: 'OpenedDialog', dialog } : { type: 'ClosedDialog' },
      )
    }

  return (
    <>
      <div className="flex min-h-dvh justify-center pt-loose pb-[calc(5.5rem+env(safe-area-inset-bottom))] ps-[max(var(--spacing-base),env(safe-area-inset-left))] pe-[max(var(--spacing-base),env(safe-area-inset-right))]">
        <main className="flex w-full max-w-measure flex-col">
          <Tabs selectedKey={model.tab} onSelectionChange={handleTabChange}>
            <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg-1 shadow-surface ps-[max(var(--spacing-base),env(safe-area-inset-left))] pe-[max(var(--spacing-base),env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)]">
              <TabsList aria-label="Sections">
                {tabs.map(tab => (
                  <TabsTrigger key={tab} id={tab}>
                    {tabIcon(tab)}
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {children !== undefined ? (
              tabs.map(tab => (
                <TabsContent key={tab} id={tab}>
                  {children}
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent id="Calendar">
                  <TodayView
                    model={model}
                    periods={periods}
                    dispatch={dispatch}
                  />
                </TabsContent>
                <TabsContent id="History">
                  <HistoryView logs={model.logs} periods={periods} />
                </TabsContent>
                <TabsContent id="About">
                  <AboutView model={model} dispatch={dispatch} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </main>
      </div>

      <Dialog
        isOpen={model.dialog === 'about'}
        onOpenChange={onDialogChange('about')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How the range is calculated</DialogTitle>
            <DialogDescription>
              Uses the median of your last six cycles so one unusual cycle
              shifts it less.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-snug text-fg-1">
            <p>
              The window is roughly an 80% band from your cycle spread, with a
              minimum width, rounded outward to whole days.
            </p>
            <p>
              Each late day shifts the window forward by less than a day. Past
              the window, predictions pause.
            </p>
          </div>
          <DialogFooter>
            <DialogClose variant="outline">Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        isOpen={model.dialog === 'clear'}
        onOpenChange={onDialogChange('clear')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all data?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes {plural(model.logs.length, 'logged day', 'logged days')}{' '}
              from this device. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="destructive"
              onClick={() => dispatch({ type: 'ClearedAllLogs' })}
            >
              <Trash2Icon aria-hidden="true" data-icon="inline-start" />
              Clear everything
            </AlertDialogAction>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const App = () => (
  <I18nProvider locale="en-GB">
    <RouterProvider router={router} />
  </I18nProvider>
)
