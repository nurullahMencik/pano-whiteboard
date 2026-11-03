import { useState } from 'react'
import { cx } from '../components/cx'
import type { TranslationKey } from '../i18n'
import { useUi } from '../store/ui'

const LABELS: Record<string, TranslationKey> = {
  connected: 'status.connected',
  connecting: 'status.connecting',
  reconnecting: 'status.reconnecting',
  waking: 'status.waking',
  offline: 'status.offline',
  local: 'status.local',
}

const DOT: Record<string, string> = {
  connected: 'bg-ok',
  connecting: 'bg-warn animate-pulse-dot',
  reconnecting: 'bg-warn animate-pulse-dot',
  waking: 'bg-warm animate-pulse-dot',
  offline: 'bg-muted',
  local: 'bg-muted',
}

/** Live connection state; the details popover explains offline/local behaviour. */
export const ConnectionBadge = () => {
  const t = useUi((s) => s.t)
  const status = useUi((s) => s.connection.status)
  const [open, setOpen] = useState(false)
  const label = t(LABELS[status])
  const hint = status === 'offline' || status === 'reconnecting' ? t('status.offlineHint') : status === 'local' ? t('status.localHint') : null
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="connection-status"
        data-status={status}
        aria-expanded={hint ? open : undefined}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm font-medium text-muted hover:bg-accent-soft hover:text-fg"
      >
        <span className={cx('h-2.5 w-2.5 rounded-full', DOT[status])} aria-hidden />
        <span className="max-sm:sr-only" role="status">
          {label}
        </span>
      </button>
      {open && hint && (
        <div className="animate-pop absolute right-0 top-11 z-40 w-64 rounded-xl border border-line bg-panel-solid p-3 text-sm text-fg shadow-panel">{hint}</div>
      )}
    </div>
  )
}
