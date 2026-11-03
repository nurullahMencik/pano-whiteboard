import { Check, Copy, Download, Eye, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog, Segmented } from '../components/ui'
import { cx } from '../components/cx'
import { boardToPng, boardToSvg, downloadBlob } from '../lib/export'
import { viewIdFor } from '../lib/ids'
import { hrefFor } from '../router'
import { useUi } from '../store/ui'
import { useBoard } from './context'

const absolute = (route: string) => new URL(hrefFor(route), window.location.origin).toString()

const QrCode = ({ value, label }: { value: string; label: string }) => {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void import('uqr').then(({ encode }) => {
      if (cancelled) return
      const { data, size } = encode(value, { ecc: 'M', border: 2 })
      let path = ''
      data.forEach((row, y) =>
        row.forEach((on, x) => {
          if (on) path += `M${x} ${y}h1v1h-1z`
        }),
      )
      setSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#1b1f2a"/></svg>`)
    })
    return () => {
      cancelled = true
    }
  }, [value])
  return (
    <div
      role="img"
      aria-label={label}
      data-testid="share-qr"
      className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-line bg-white p-1"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}

const CopyField = ({ value, label }: { value: string; label: string }) => {
  const t = useUi((s) => s.t)
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-bg px-3 text-sm" />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            .writeText(value)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            })
            .catch(() => undefined)
        }}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover dark:text-[#14161c]"
      >
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        {copied ? t('share.copied') : t('share.copy')}
      </button>
    </div>
  )
}

export const ShareDialog = () => {
  const { kind, id } = useBoard()
  const t = useUi((s) => s.t)
  const open = useUi((s) => s.dialog === 'share')
  const setDialog = useUi((s) => s.setDialog)
  const [viewId, setViewId] = useState<string | null>(kind === 'v' ? id : null)
  const [readOnly, setReadOnly] = useState(kind === 'v')

  useEffect(() => {
    if (kind === 'v') return
    let cancelled = false
    void viewIdFor(id).then((value) => {
      if (!cancelled) setViewId(value)
    })
    return () => {
      cancelled = true
    }
  }, [kind, id])

  const editUrl = kind === 'r' ? absolute(`b/${id}`) : null
  const viewUrl = viewId ? absolute(`v/${viewId}`) : null
  const shown = readOnly || !editUrl ? viewUrl : editUrl

  return (
    <Dialog open={open} title={t('share.title')} onClose={() => setDialog(null)}>
      <div className="space-y-4">
        {kind === 'r' && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('share.title')}>
            {[
              { value: false, icon: Pencil, title: t('share.edit'), hint: t('share.editHint') },
              { value: true, icon: Eye, title: t('share.view'), hint: t('share.viewHint') },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={readOnly === option.value}
                data-testid={option.value ? 'share-readonly' : 'share-edit'}
                onClick={() => setReadOnly(option.value)}
                className={cx(
                  'rounded-xl border p-3 text-left transition-colors',
                  readOnly === option.value ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent',
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <option.icon size={15} aria-hidden />
                  {option.title}
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted">{option.hint}</span>
              </button>
            ))}
          </div>
        )}
        {shown && <CopyField value={shown} label={readOnly ? t('share.view') : t('share.edit')} />}
        {shown && (
          <div className="flex items-center gap-4">
            <QrCode value={shown} label={t('share.qrAlt')} />
            <p className="text-sm text-muted">{t('share.qr')}</p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export const ExportDialog = () => {
  const { engine } = useBoard()
  const t = useUi((s) => s.t)
  const open = useUi((s) => s.dialog === 'export')
  const setDialog = useUi((s) => s.setDialog)
  const theme = useUi((s) => s.resolvedTheme)
  const selection = useUi((s) => s.selection)
  const showToast = useUi((s) => s.showToast)
  const [format, setFormat] = useState<'png' | 'svg'>('png')
  const [scopePref, setScope] = useState<'all' | 'selection'>('all')
  const [background, setBackground] = useState(true)
  const [scale, setScale] = useState(2)
  const [busy, setBusy] = useState(false)
  const scope = selection ? scopePref : 'all'

  const run = async () => {
    const elements = engine.exportElements(scope)
    if (elements.length === 0) {
      showToast(t('export.empty'))
      return
    }
    setBusy(true)
    try {
      const options = { theme, background, assets: engine.assetUrl }
      const stamp = new Date().toISOString().slice(0, 10)
      const file = `pano-${stamp}.${format}`
      if (format === 'png') {
        const { blob } = await boardToPng(elements, { ...options, scale })
        downloadBlob(blob, file)
      } else {
        const { svg } = boardToSvg(elements, options)
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), file)
      }
      showToast(t('export.done', { file }))
      setDialog(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} title={t('export.title')} onClose={() => setDialog(null)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('export.format')}</span>
          <Segmented
            label={t('export.format')}
            value={format}
            onChange={setFormat}
            options={[
              { value: 'png', label: 'PNG', title: 'PNG' },
              { value: 'svg', label: 'SVG', title: 'SVG' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('export.scope')}</span>
          <Segmented
            label={t('export.scope')}
            value={scope}
            onChange={(value) => setScope(value)}
            options={[
              { value: 'all', label: t('export.scope.all'), title: t('export.scope.all') },
              ...(selection ? [{ value: 'selection' as const, label: t('export.scope.selection', { n: selection.count }), title: t('export.scope.selection', { n: selection.count }) }] : []),
            ]}
          />
        </div>
        {format === 'png' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('export.scale')}</span>
            <Segmented
              label={t('export.scale')}
              value={scale}
              onChange={setScale}
              options={[1, 2, 3].map((value) => ({ value, label: `${value}×`, title: `${value}×` }))}
            />
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          {t('export.background')}
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          data-testid="export-download"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-white hover:bg-accent-hover disabled:opacity-60 dark:text-[#14161c]"
        >
          <Download size={18} aria-hidden />
          {t('export.download')}
        </button>
      </div>
    </Dialog>
  )
}

const Key = ({ children }: { children: string }) => (
  <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-line-strong bg-bg px-1.5 py-0.5 font-sans text-xs font-semibold">{children}</kbd>
)

export const HelpDialog = () => {
  const t = useUi((s) => s.t)
  const open = useUi((s) => s.dialog === 'help')
  const setDialog = useUi((s) => s.setDialog)
  const groups: { title: string; rows: [string[], string][] }[] = [
    {
      title: t('help.tools'),
      rows: [
        [['V'], t('tool.select')],
        [['H'], t('tool.hand')],
        [['P'], t('tool.freedraw')],
        [['E'], t('tool.eraser')],
        [['R'], t('tool.rect')],
        [['O'], t('tool.ellipse')],
        [['D'], t('tool.diamond')],
        [['A'], t('tool.arrow')],
        [['L'], t('tool.line')],
        [['T'], t('tool.text')],
        [['S'], t('tool.sticky')],
        [['I'], t('tool.image')],
      ],
    },
    {
      title: t('help.editing'),
      rows: [
        [['Ctrl', 'Z'], t('help.undo')],
        [['Ctrl', 'Shift', 'Z'], t('help.redo')],
        [['Del'], t('help.delete')],
        [['Ctrl', 'D'], t('help.duplicate')],
        [['Ctrl', 'C / V'], t('help.copyPaste')],
        [['Ctrl', 'A'], t('help.selectAll')],
        [['←↑→↓'], t('help.nudge')],
        [['[', ']'], t('help.layers')],
        [[t('key.enter')], t('help.editText')],
        [['Esc'], t('help.deselect')],
      ],
    },
    {
      title: t('help.view'),
      rows: [
        [[t('key.space')], t('help.pan')],
        [[t('key.wheel')], t('help.zoom')],
        [['+', '-'], t('help.zoom')],
        [['Shift', '1'], t('help.zoomFit')],
        [['0'], t('help.zoomReset')],
        [['?'], t('help.help')],
      ],
    },
  ]
  return (
    <Dialog open={open} title={t('help.title')} onClose={() => setDialog(null)} wide>
      <div className="grid gap-6 sm:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{group.title}</h3>
            <dl className="space-y-1.5">
              {group.rows.map(([keys, label]) => (
                <div key={label + keys.join()} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-fg">{label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((key) => (
                      <Key key={key}>{key}</Key>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted">{t('help.shift')}</p>
      <p className="mt-1 text-sm text-muted">{t('help.touch')}</p>
    </Dialog>
  )
}
