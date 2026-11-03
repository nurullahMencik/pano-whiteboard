import { Check, Eye, LocateFixed, Pencil, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { saveUserName } from '../collab/user'
import { Panel } from '../components/ui'
import { cx } from '../components/cx'
import { contrastText } from '../lib/colors'
import type { Peer, PresenceState } from '../lib/types'
import { useUi } from '../store/ui'
import { useBoard } from './context'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr'))
    .join('')

const Avatar = ({ peer, size = 30, ring = true }: { peer: Peer; size?: number; ring?: boolean }) => (
  <span
    className={cx('inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold', ring && 'border-2 border-panel-solid')}
    style={{ width: size, height: size, background: peer.user.color, color: contrastText(peer.user.color) }}
    aria-hidden
  >
    {initials(peer.user.name)}
  </span>
)

/** Avatars of everyone online plus a list with "follow" and rename. */
export const People = () => {
  const { engine, session } = useBoard()
  const t = useUi((s) => s.t)
  const peers = useUi((s) => s.peers)
  const following = useUi((s) => s.following)
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const others = peers.filter((p) => !p.isSelf)
  const shown = peers.slice(0, 4)
  const rename = () => {
    if (renaming === null) return
    const name = renaming.trim().slice(0, 32)
    if (name) {
      saveUserName(name)
      const state = session.awareness.getLocalState() as PresenceState | null
      if (state) session.setPresence({ user: { ...state.user, name } })
    }
    setRenaming(null)
  }

  return (
    <div ref={rootRef} className="relative">
      <Panel className="p-1">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${t('people.title')}: ${t('people.count', { n: peers.length })}`}
          data-testid="people-button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 items-center rounded-xl px-1.5 hover:bg-accent-soft"
        >
          <span className="flex -space-x-2">
            {shown.map((peer) => (
              <Avatar key={peer.clientId} peer={peer} />
            ))}
          </span>
          {peers.length > shown.length && <span className="ml-1.5 text-xs font-semibold text-muted">+{peers.length - shown.length}</span>}
          {peers.length === 0 && <Users size={18} aria-hidden />}
        </button>
      </Panel>
      {open && (
        <Panel className="animate-pop absolute right-0 top-12 z-40 w-72 p-2" role="dialog" aria-label={t('people.title')}>
          <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">{t('people.count', { n: peers.length })}</p>
          <ul className="space-y-0.5">
            {peers.map((peer) => (
              <li key={peer.clientId} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-accent-soft/60">
                <Avatar peer={peer} size={28} ring={false} />
                {peer.isSelf && renaming !== null ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      rename()
                    }}
                  >
                    <input
                      autoFocus
                      value={renaming}
                      aria-label={t('people.nameLabel')}
                      onChange={(e) => setRenaming(e.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-panel-solid px-2 text-sm"
                    />
                    <button type="submit" aria-label={t('people.rename')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent-soft">
                      <Check size={16} aria-hidden />
                    </button>
                  </form>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {peer.user.name} {peer.isSelf && <span className="text-muted">{t('people.you')}</span>}
                    </span>
                    {peer.readOnly && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Eye size={12} aria-hidden />
                        {t('people.viewer')}
                      </span>
                    )}
                  </span>
                )}
                {peer.isSelf
                  ? renaming === null && (
                      <button
                        type="button"
                        aria-label={t('people.rename')}
                        title={t('people.rename')}
                        onClick={() => setRenaming(peer.user.name)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-fg"
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                    )
                  : (
                      <button
                        type="button"
                        aria-pressed={following === peer.clientId}
                        onClick={() => {
                          engine.follow(following === peer.clientId ? null : peer.clientId)
                          setOpen(false)
                        }}
                        className={cx(
                          'inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold',
                          following === peer.clientId ? 'bg-accent text-white dark:text-[#14161c]' : 'text-accent-text hover:bg-accent-soft',
                        )}
                      >
                        <LocateFixed size={14} aria-hidden />
                        {following === peer.clientId ? t('people.unfollow') : t('people.follow')}
                      </button>
                    )}
              </li>
            ))}
          </ul>
          {others.length === 0 && <p className="px-2 pb-1 pt-2 text-sm text-muted">{t('people.alone')}</p>}
        </Panel>
      )}
    </div>
  )
}
