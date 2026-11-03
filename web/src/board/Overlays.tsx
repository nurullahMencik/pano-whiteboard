import { LocateFixed, Maximize, Minus, Plus, Redo2, Server, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IconButton, Panel } from '../components/ui'
import { useUi } from '../store/ui'
import { useBoard } from './context'

/** Non-blocking card shown while a sleeping free-tier server boots. Drawing keeps working. */
export const WakingNotice = () => {
  const { session } = useBoard()
  const t = useUi((s) => s.t)
  const status = useUi((s) => s.connection.status)
  const since = useUi((s) => s.connection.wakingSince)
  const [now, setNow] = useState(() => Date.now())
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const active = status === 'waking'

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  if (!active || (dismissedAt !== null && since !== null && dismissedAt >= since)) return null
  const elapsed = since ? Math.max(0, Math.round((now - since) / 1000)) : 0
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-3 sm:top-20" data-testid="waking-notice">
      <Panel className="animate-pop pointer-events-auto w-full max-w-md overflow-hidden" role="status" aria-live="polite">
        <div className="flex gap-3 p-4">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text" aria-hidden>
            <Server size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-between gap-2 font-semibold">
              {t('waking.title')}
              <span className="text-xs font-medium tabular-nums text-muted">{t('waking.elapsed', { n: elapsed })}</span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t('waking.body')}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => session.retryNow()}
                className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover dark:text-[#14161c]"
              >
                {t('waking.retry')}
              </button>
              <button type="button" onClick={() => setDismissedAt(Date.now())} className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-muted hover:bg-accent-soft hover:text-fg">
                {t('waking.dismiss')}
              </button>
            </div>
          </div>
        </div>
        <div className="h-1 overflow-hidden bg-accent-soft" aria-hidden>
          <div className="progress-slide h-full w-1/3 rounded-full bg-accent" />
        </div>
      </Panel>
    </div>
  )
}

export const FollowBanner = () => {
  const { engine } = useBoard()
  const t = useUi((s) => s.t)
  const following = useUi((s) => s.following)
  const peer = useUi((s) => s.peers.find((p) => p.clientId === s.following))
  if (following === null || !peer) return null
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 border-[3px]" style={{ borderColor: peer.user.color }} aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-3 sm:bottom-5">
        <div
          className="animate-pop pointer-events-auto flex items-center gap-2 rounded-xl py-1.5 pl-3 pr-1.5 text-sm font-semibold text-white shadow-lg"
          style={{ background: peer.user.color }}
          role="status"
        >
          <LocateFixed size={15} aria-hidden />
          {t('people.following', { name: peer.user.name })}
          <span className="font-normal opacity-80 max-sm:hidden">· {t('people.stopHint')}</span>
          <button type="button" onClick={() => engine.follow(null)} aria-label={t('people.unfollow')} className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/20">
            <X size={15} aria-hidden />
          </button>
        </div>
      </div>
    </>
  )
}

export const ZoomControls = () => {
  const { engine, session } = useBoard()
  const t = useUi((s) => s.t)
  const zoom = useUi((s) => s.zoom)
  const canUndo = useUi((s) => s.canUndo)
  const canRedo = useUi((s) => s.canRedo)
  return (
    <div className="absolute bottom-3 right-3 z-20 flex gap-2 max-sm:bottom-[4.6rem] max-sm:right-2">
      {!session.readOnly && (
        <Panel className="flex items-center p-1">
          <IconButton label={t('board.undo')} shortcut="Ctrl+Z" tipSide="top" disabled={!canUndo} onClick={() => engine.undo()} data-testid="undo">
            <Undo2 size={18} aria-hidden />
          </IconButton>
          <IconButton label={t('board.redo')} shortcut="Ctrl+Shift+Z" tipSide="top" disabled={!canRedo} onClick={() => engine.redo()}>
            <Redo2 size={18} aria-hidden />
          </IconButton>
        </Panel>
      )}
      <Panel className="flex items-center p-1 max-sm:hidden">
        <IconButton label={t('board.zoomOut')} shortcut="-" tipSide="top" onClick={() => engine.zoomBy(1 / 1.2)}>
          <Minus size={18} aria-hidden />
        </IconButton>
        <button
          type="button"
          onClick={() => engine.zoomTo(1)}
          aria-label={`${t('board.zoomReset')} (${Math.round(zoom * 100)}%)`}
          className="h-10 min-w-14 rounded-xl px-1 text-sm font-semibold tabular-nums hover:bg-accent-soft"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label={t('board.zoomIn')} shortcut="+" tipSide="top" onClick={() => engine.zoomBy(1.2)}>
          <Plus size={18} aria-hidden />
        </IconButton>
        <IconButton label={t('board.zoomFit')} shortcut="Shift+1" tipSide="top" onClick={() => engine.zoomToFit()}>
          <Maximize size={17} aria-hidden />
        </IconButton>
      </Panel>
    </div>
  )
}

export const EmptyHint = () => {
  const t = useUi((s) => s.t)
  const count = useUi((s) => s.elementCount)
  const { session } = useBoard()
  if (count > 0 || session.readOnly) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-8">
      <p className="max-w-xs text-center text-base text-muted">{t('board.emptyHint')}</p>
    </div>
  )
}
