import {
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  useRef,
  useState,
} from 'react'

import {
  CloudIcon,
  CloudOffIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  MoonIcon,
  RefreshCwIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'

import { MIN_PASSPHRASE_LENGTH } from '@cycle/sync'

import { BrandMark } from '../components/brand-mark'
import { Button, Separator } from '../components/ui'
import type { Flow } from '../domain'
import { plural } from '../format'
import {
  type Action,
  type Model,
  formatStoredLogs,
  parseStoredLogs,
} from '../state'
import { enableSync, loadSyncCredentials, runSync } from '../sync'
import { useTheme } from '../theme'
import { FlowMark } from './today'

const LegendItem = ({
  flow,
  label,
}: {
  readonly flow: Flow
  readonly label: string
}) => (
  <span className="inline-flex items-center gap-snug text-sm text-fg-1">
    <FlowMark flow={flow} />
    <span>{label}</span>
  </span>
)

const INPUT_CLASS =
  'min-h-11 w-full rounded-md border border-line bg-bg-1 px-base py-snug text-sm text-fg-0 shadow-inset outline-none placeholder:text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const SyncSection = ({
  model,
  dispatch,
}: {
  readonly model: Model
  readonly dispatch: Dispatch<Action>
}) => {
  const [username, setUsername] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (busy) {
      return
    }

    setBusy(true)
    setFormError(null)

    const outcome = await enableSync(username, passphrase, model.vault)

    setBusy(false)

    if (!outcome.ok) {
      setFormError(outcome.message)
      return
    }

    setPassphrase('')
    dispatch({
      type: 'SyncEnabled',
      username: outcome.credentials.username,
      snapshot: outcome.snapshot,
    })
  }

  const onSyncNow = async () => {
    const credentials = loadSyncCredentials()

    if (credentials === null) {
      dispatch({ type: 'SyncDisabled' })
      return
    }

    dispatch({ type: 'SyncStarted' })
    const outcome = await runSync(credentials, model.vault)

    if (outcome.ok) {
      dispatch({
        type: 'SyncSucceeded',
        username: credentials.username,
        snapshot: outcome.snapshot,
      })
    } else {
      dispatch({ type: 'SyncFailed', message: outcome.message })
    }
  }

  if (model.sync.status === 'ready') {
    const statusText =
      model.sync.activity === 'syncing'
        ? 'Syncing…'
        : model.sync.activity === 'error'
          ? (model.sync.error ?? 'Sync failed.')
          : 'Synced'

    return (
      <div className="flex flex-col items-start gap-snug">
        <div className="flex flex-wrap items-baseline gap-snug text-sm">
          <span className="font-medium text-fg-0">
            Sync · {model.sync.username}
          </span>
          <span
            className={
              model.sync.activity === 'error' ? 'text-danger' : 'text-fg-1'
            }
          >
            {statusText}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-snug">
          <Button
            variant="outline"
            disabled={model.sync.activity === 'syncing'}
            onClick={() => void onSyncNow()}
          >
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            Sync now
          </Button>
          <Button
            variant="ghost"
            onClick={() => dispatch({ type: 'SyncDisabled' })}
          >
            <CloudOffIcon aria-hidden="true" data-icon="inline-start" />
            Turn off sync
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={event => void onSubmit(event)}
      className="flex flex-col items-start gap-snug"
    >
      <div className="flex flex-col gap-tight text-sm">
        <span className="font-medium text-fg-0">Sync</span>
        <p className="text-fg-1">
          Optional. Your username and passphrase encrypt your logs on this
          device, and the server stores only ciphertext.
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-snug sm:grid-cols-2">
        <input
          name="username"
          type="text"
          autoComplete="username"
          placeholder="Username"
          aria-label="Sync username"
          required
          value={username}
          onChange={event => setUsername(event.target.value)}
          className={INPUT_CLASS}
        />
        <div className="relative flex items-center">
          <input
            name="passphrase"
            type={showPassphrase ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Passphrase (8+ chars)"
            aria-label="Sync passphrase"
            minLength={MIN_PASSPHRASE_LENGTH}
            required
            value={passphrase}
            onChange={event => setPassphrase(event.target.value)}
            className={`${INPUT_CLASS} pe-11`}
          />
          <button
            type="button"
            aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            onClick={() => setShowPassphrase(current => !current)}
            className="absolute end-0 inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-fg-1 outline-none hover:text-fg-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            {showPassphrase ? (
              <EyeOffIcon aria-hidden="true" className="size-4" />
            ) : (
              <EyeIcon aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </div>
      {formError === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={busy}>
        <CloudIcon aria-hidden="true" data-icon="inline-start" />
        {busy ? 'Connecting…' : 'Turn on sync'}
      </Button>
    </form>
  )
}

export const AboutView = ({
  model,
  dispatch,
}: {
  readonly model: Model
  readonly dispatch: Dispatch<Action>
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { theme, toggle } = useTheme()

  const onExport = () => {
    const blob = new Blob([formatStoredLogs(model.logs)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cycle-logs.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (file === undefined) {
      return
    }

    try {
      const text = await file.text()
      const logs = parseStoredLogs(JSON.parse(text))
      dispatch({ type: 'ImportedLogs', logs })
    } catch {}
  }

  return (
    <div className="flex flex-col gap-base">
      <header className="flex items-center justify-between gap-snug">
        <div className="flex items-center gap-snug">
          <BrandMark className="size-8" />
          <div>
            <p className="font-semibold text-fg-0">Cycle</p>
            <p className="text-sm text-fg-1">Private period tracking</p>
          </div>
        </div>
        <Button
          variant="outline"
          data-slot="theme-toggle"
          aria-label={
            theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
          onClick={toggle}
        >
          {theme === 'dark' ? (
            <MoonIcon aria-hidden="true" data-icon="inline-start" />
          ) : (
            <SunIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {theme === 'dark' ? 'Dark' : 'Light'}
        </Button>
      </header>

      <div className="flex flex-col gap-snug text-sm text-fg-1">
        <p>
          Cycle is a local period tracker. Your logs stay on this device unless
          you turn on sync, with no account and no analytics.
        </p>
        <p>
          Hold any day on the calendar to start editing, then tap or drag across
          days to log bleeding or spotting and tap Save.
        </p>
      </div>

      <Separator />

      <SyncSection model={model} dispatch={dispatch} />

      <Separator />

      <div className="flex flex-col items-start gap-snug">
        <p className="text-sm text-fg-1">
          {plural(model.logs.length, 'day', 'days')} logged.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          aria-label="Import data file"
          className="hidden"
          onChange={onImportFile}
        />
        <div className="flex flex-wrap items-center gap-snug">
          <Button variant="outline" onClick={onExport}>
            <DownloadIcon aria-hidden="true" data-icon="inline-start" />
            Export data
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon aria-hidden="true" data-icon="inline-start" />
            Import data
          </Button>
          <Button
            variant="destructive"
            onClick={() => dispatch({ type: 'OpenedDialog', dialog: 'clear' })}
          >
            <Trash2Icon aria-hidden="true" data-icon="inline-start" />
            Clear all data
          </Button>
        </div>
      </div>

      <Separator />

      <section className="flex flex-col gap-base">
        <div className="flex flex-col gap-snug">
          <h2 className="text-sm font-medium text-fg-0">Marks</h2>
          <div className="flex flex-wrap items-center gap-x-base gap-y-snug">
            <LegendItem flow="Bleeding" label="Bleeding" />
            <LegendItem flow="Spotting" label="Spotting" />
            <span className="inline-flex items-center gap-snug text-sm text-fg-1">
              <span
                aria-hidden="true"
                className="size-3 rounded-xs border border-dashed border-bleeding/70"
              />
              <span>Predicted</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-snug text-sm text-fg-1">
          <h2 className="text-sm font-medium text-fg-0">
            How the range is calculated
          </h2>
          <p>
            Cycle predicts your next period as a date window using the median
            and spread of your last six cycles, rounded outward to whole days.
          </p>
          <p>
            Each late day shifts the window forward by less than a day. Once you
            pass the window, predictions pause until you log a new period.
          </p>
          <p>Do not use these dates for fertility or contraception.</p>
        </div>
      </section>
    </div>
  )
}
