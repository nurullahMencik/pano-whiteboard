import { ArrowLeft, CircleHelp, Download, Eye, Menu, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LogoMark } from '../components/Logo'
import { LangToggle, ThemeToggle } from '../components/PrefsControls'
import { IconButton, Panel } from '../components/ui'
import { hrefFor, navigate } from '../router'
import { useUi } from '../store/ui'
import { ConnectionBadge } from './ConnectionBadge'
import { People } from './People'
import { useBoard } from './context'

/** Board title bound to the shared doc (`meta.title`), editable by editors. */
const BoardTitle = () => {
  const { session } = useBoard()
  const t = useUi((s) => s.t)
  const [title, setTitle] = useState(() => (session.model.meta.get('title') as string | undefined) ?? '')
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    const meta = session.model.meta
    const update = () => setTitle((meta.get('title') as string | undefined) ?? '')
    meta.observe(update)
    return () => meta.unobserve(update)
  }, [session])

  useEffect(() => {
    const name = title || t('board.untitled')
    document.title = `${name} · Pano`
  }, [title, t])

  const commit = () => {
    if (draft === null) return
    const next = draft.trim().slice(0, 80)
    if (next !== title) session.model.transact(() => session.model.meta.set('title', next))
    setDraft(null)
  }

  if (session.readOnly) {
    return <h1 className="truncate px-2 text-[15px] font-semibold">{title || t('board.untitled')}</h1>
  }
  return (
    <input
      value={draft ?? title}
      placeholder={t('board.untitled')}
      aria-label={t('board.titleLabel')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
      className="h-9 w-full min-w-0 rounded-lg bg-transparent px-2 text-[15px] font-semibold outline-none placeholder:text-muted hover:bg-accent-soft focus:bg-accent-soft sm:w-56"
    />
  )
}

/** Phone-only overflow menu for actions that do not fit the top bar. */
const MobileMenu = () => {
  const t = useUi((s) => s.t)
  const setDialog = useUi((s) => s.setDialog)
  const [open, setOpen] = useState(false)
  return (
    <div className="relative sm:hidden">
      <IconButton label={t('board.menu')} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="h-9 w-9">
        <Menu size={18} aria-hidden />
      </IconButton>
      {open && (
        <Panel className="animate-pop absolute right-0 top-11 flex flex-col gap-1 p-1.5" role="menu" aria-label={t('board.menu')}>
          <div className="flex gap-1">
            <IconButton
              label={t('board.export')}
              tipSide="left"
              onClick={() => {
                setOpen(false)
                setDialog('export')
              }}
            >
              <Download size={18} aria-hidden />
            </IconButton>
            <IconButton
              label={t('board.help')}
              tipSide="left"
              onClick={() => {
                setOpen(false)
                setDialog('help')
              }}
            >
              <CircleHelp size={18} aria-hidden />
            </IconButton>
            <LangToggle tipSide="left" />
            <ThemeToggle tipSide="left" />
          </div>
        </Panel>
      )}
    </div>
  )
}

export const TopBar = () => {
  const { session } = useBoard()
  const t = useUi((s) => s.t)
  const setDialog = useUi((s) => s.setDialog)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2 sm:p-3">
      <Panel className="pointer-events-auto flex min-w-0 items-center gap-1 p-1 pr-2">
        <a
          href={hrefFor('')}
          onClick={(e) => {
            e.preventDefault()
            navigate('')
          }}
          aria-label={t('board.home')}
          className="group inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-1.5 hover:bg-accent-soft"
        >
          <ArrowLeft size={16} className="text-muted group-hover:text-fg" aria-hidden />
          <LogoMark size={24} />
        </a>
        <BoardTitle />
        {session.readOnly && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-text" title={t('board.readOnlyHint')}>
            <Eye size={13} aria-hidden />
            <span className="max-sm:hidden">{t('board.readOnlyBadge')}</span>
          </span>
        )}
      </Panel>

      <div className="pointer-events-auto flex shrink-0 items-start gap-2">
        <People />
        <Panel className="flex items-center gap-0.5 p-1">
          <ConnectionBadge />
          <div className="mx-0.5 h-6 w-px bg-line max-sm:hidden" aria-hidden />
          <div className="flex items-center max-sm:hidden">
            <IconButton label={t('board.export')} onClick={() => setDialog('export')}>
              <Download size={18} aria-hidden />
            </IconButton>
            <IconButton label={t('board.help')} shortcut="?" onClick={() => setDialog('help')}>
              <CircleHelp size={18} aria-hidden />
            </IconButton>
            <LangToggle />
            <ThemeToggle />
          </div>
          <MobileMenu />
          <button
            type="button"
            onClick={() => setDialog('share')}
            className="ml-0.5 inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover dark:text-[#14161c]"
          >
            <Share2 size={16} aria-hidden />
            <span className="max-sm:sr-only">{t('board.share')}</span>
          </button>
        </Panel>
      </div>
    </div>
  )
}
