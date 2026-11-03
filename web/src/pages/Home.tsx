import { ArrowRight, CloudOff, Code2, Eye, MousePointer2, Play, Plus, ShieldCheck, Users, X, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BoardPreview } from '../components/BoardPreview'
import { Logo } from '../components/Logo'
import { PrefsControls } from '../components/PrefsControls'
import { cx } from '../components/cx'
import { PORTFOLIO_URL, REPO_URL } from '../config'
import type { Translate } from '../i18n'
import { buildDemo } from '../lib/demo'
import { createRoomId } from '../lib/ids'
import { loadRecent, removeRecent, setPendingSeed, type RecentBoard } from '../lib/storage'
import { TEMPLATE_IDS, buildTemplate, type TemplateId } from '../lib/templates'
import { hrefFor, navigate } from '../router'
import { useUi } from '../store/ui'

const createBoard = (template: TemplateId | 'demo') => {
  const id = createRoomId()
  setPendingSeed(id, template)
  navigate(`b/${id}`)
}

const relativeTime = (t: Translate, at: number) => {
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) return t('home.justNow')
  if (minutes < 60) return t('home.minutesAgo', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('home.hoursAgo', { n: hours })
  return t('home.daysAgo', { n: Math.round(hours / 24) })
}

const FakeCursor = ({ name, color, className }: { name: string; color: string; className: string }) => (
  <div className={cx('pointer-events-none absolute', className)} aria-hidden="true">
    <svg width="20" height="22" viewBox="0 0 22 24" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.25))' }}>
      <path d="M3 2.5 L3 19 L7.6 14.6 L10.6 21.2 L13.6 19.9 L10.7 13.4 L17 13.4 Z" fill={color} stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
    <span className="absolute left-3.5 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: color }}>
      {name}
    </span>
  </div>
)

const TEMPLATE_ACCENTS: Record<TemplateId, string> = {
  blank: 'from-slate-200/60',
  retro: 'from-emerald-200/60',
  flow: 'from-sky-200/60',
  brainstorm: 'from-violet-200/60',
}

export default function Home() {
  const t = useUi((s) => s.t)
  const lang = useUi((s) => s.lang)
  const theme = useUi((s) => s.resolvedTheme)
  const [recent, setRecent] = useState<RecentBoard[]>(() => loadRecent())
  const demo = useMemo(() => buildDemo(t), [t])
  const templates = useMemo(() => TEMPLATE_IDS.map((id) => ({ id, content: buildTemplate(id, t) })), [t])

  const features = [
    { icon: Zap, title: t('home.feature.crdt.title'), body: t('home.feature.crdt.body') },
    { icon: CloudOff, title: t('home.feature.offline.title'), body: t('home.feature.offline.body') },
    { icon: Users, title: t('home.feature.presence.title'), body: t('home.feature.presence.body') },
    { icon: ShieldCheck, title: t('home.feature.share.title'), body: t('home.feature.share.body') },
  ]

  return (
    <div className="min-h-full overflow-x-clip bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-panel-solid focus:px-3 focus:py-2">
        {t('app.skip')}
      </a>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a href={hrefFor('')} className="rounded-lg" aria-label={`${t('app.name')} · ${t('app.tagline')}`}>
          <Logo />
        </a>
        <div className="flex items-center gap-1">
          <PrefsControls />
          <a
            href={REPO_URL}
            className="ml-1 hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:bg-accent-soft hover:text-fg sm:inline-flex"
            rel="noopener"
          >
            <Code2 size={18} aria-hidden />
            {t('home.source')}
          </a>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-6 sm:px-6 lg:grid-cols-[1fr_1.12fr] lg:pt-12">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
              <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
              Yjs CRDT · WebSocket · IndexedDB
            </p>
            <h1 className="text-[2.35rem] font-extrabold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">{t('home.title')}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t('home.lead')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => createBoard('blank')}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-accent-hover dark:text-[#14161c]"
              >
                <Plus size={20} aria-hidden />
                {t('home.create')}
              </button>
              <button
                type="button"
                onClick={() => createBoard('demo')}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-panel-solid px-5 font-semibold text-fg transition-colors hover:border-accent hover:text-accent-text"
              >
                <Play size={18} aria-hidden />
                {t('home.openDemo')}
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-0 rounded-[2.5rem] bg-gradient-to-br from-indigo-300/30 via-amber-200/20 to-emerald-200/30 blur-2xl dark:from-indigo-500/20 dark:via-amber-500/10 dark:to-emerald-500/10" aria-hidden />
            <figure className="relative overflow-hidden rounded-3xl border border-line bg-panel-solid shadow-panel">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffd43b]" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#51cf66]" aria-hidden />
                <span className="ml-2 truncate text-xs font-semibold text-muted">{t('demo.title')}</span>
                <span className="ml-auto flex -space-x-1.5" aria-hidden>
                  {['#e8590c', '#1c7ed6', '#2f9e44'].map((color, i) => (
                    <span key={color} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-panel-solid text-[10px] font-bold text-white" style={{ background: color }}>
                      {['N', 'E', 'M'][i]}
                    </span>
                  ))}
                </span>
              </div>
              <div
                className="relative aspect-[16/10] bg-bg"
                style={{ backgroundImage: 'radial-gradient(var(--line-strong) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
              >
                <BoardPreview content={demo} theme={theme} label={t('home.demoCaption')} className="absolute inset-0 p-3" />
                <FakeCursor name="Elif" color="#1c7ed6" className="left-[46%] top-[30%]" />
                <FakeCursor name="Mert" color="#2f9e44" className="left-[78%] top-[62%]" />
                <FakeCursor name="Nurullah" color="#e8590c" className="left-[60%] top-[80%]" />
              </div>
              <figcaption className="sr-only">{t('home.demoCaption')}</figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="templates-title" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <h2 id="templates-title" className="mb-4 text-xl font-bold tracking-tight">
            {t('home.templates')}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {templates.map(({ id, content }) => (
              <button
                key={id}
                type="button"
                onClick={() => createBoard(id)}
                className="group overflow-hidden rounded-2xl border border-line bg-panel-solid text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-panel"
              >
                <div className={cx('relative aspect-[16/10] bg-gradient-to-br to-transparent', TEMPLATE_ACCENTS[id])}>
                  {id === 'blank' ? (
                    <div className="absolute inset-0 flex items-center justify-center text-muted" aria-hidden>
                      <Plus size={36} strokeWidth={1.5} />
                    </div>
                  ) : (
                    <BoardPreview content={content} theme={theme} label="" className="absolute inset-0 p-2" />
                  )}
                </div>
                <div className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 font-semibold">
                    {t(`template.${id}`)}
                    <ArrowRight size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-text" aria-hidden />
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{t(`template.${id}.desc`)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="recent-title" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <h2 id="recent-title" className="mb-4 text-xl font-bold tracking-tight">
            {t('home.recent')}
          </h2>
          {recent.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-muted">{t('home.recentEmpty')}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((board) => {
                const title = board.title || t('board.untitled')
                return (
                  <li key={`${board.kind}/${board.id}`} className="group relative">
                    <a
                      href={hrefFor(`${board.kind === 'r' ? 'b' : 'v'}/${board.id}`)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                        e.preventDefault()
                        navigate(`${board.kind === 'r' ? 'b' : 'v'}/${board.id}`)
                      }}
                      className="flex items-center gap-3 rounded-2xl border border-line bg-panel-solid p-2.5 pr-12 transition hover:border-accent"
                    >
                      <span className="block h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-bg-soft">
                        {board.thumb && <img src={board.thumb} alt="" width={96} height={64} className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                          {board.kind === 'v' && <Eye size={14} aria-label={t('home.readOnly')} />}
                          {relativeTime(t, board.openedAt)}
                        </span>
                      </span>
                    </a>
                    <button
                      type="button"
                      aria-label={t('home.recentRemove', { title })}
                      onClick={() => {
                        removeRecent(board.kind, board.id)
                        setRecent(loadRecent())
                      }}
                      className="absolute right-2.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-fg"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 id="features-title" className="mb-4 text-xl font-bold tracking-tight">
            {t('home.features')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-2xl border border-line bg-panel-solid p-5">
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text" aria-hidden>
                  <Icon size={20} />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span className="inline-flex items-center gap-2">
            <MousePointer2 size={15} aria-hidden />
            {t('home.footer')}
          </span>
          <span className="flex gap-4">
            <a className="underline-offset-4 hover:text-fg hover:underline" href={PORTFOLIO_URL} lang={lang}>
              {t('home.portfolio')}
            </a>
            <a className="underline-offset-4 hover:text-fg hover:underline" href={REPO_URL} rel="noopener">
              {t('home.source')}
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
