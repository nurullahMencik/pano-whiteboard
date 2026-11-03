import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp, CopyPlus, Lock, LockOpen, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton, Panel, Segmented } from '../components/ui'
import { cx } from '../components/cx'
import { FILL_SWATCHES, INK, NONE, STICKY_SWATCHES, STROKE_SWATCHES, THEME, type Swatch } from '../lib/colors'
import type { ElementType, Tool } from '../lib/types'
import { useUi, type ToolStyle } from '../store/ui'
import { useBoard } from './context'

const TOOL_TYPES: Partial<Record<Tool, ElementType>> = {
  freedraw: 'freedraw',
  rect: 'rect',
  ellipse: 'ellipse',
  diamond: 'diamond',
  arrow: 'arrow',
  line: 'line',
  text: 'text',
  sticky: 'sticky',
}

const SHAPES: ElementType[] = ['rect', 'ellipse', 'diamond']
const STROKED: ElementType[] = [...SHAPES, 'line', 'arrow', 'freedraw']

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="min-w-0">
    <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</legend>
    {children}
  </fieldset>
)

const Swatches = ({
  swatches,
  value,
  onChange,
  label,
}: {
  swatches: Swatch[]
  value: string | null
  onChange: (value: string) => void
  label: string
}) => {
  const t = useUi((s) => s.t)
  const theme = useUi((s) => s.resolvedTheme)
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-8 gap-1">
      {swatches.map((swatch) => {
        const name = t(`color.${swatch.name}`)
        const accessible = swatch.light ? t('style.light', { color: name }) : name
        const color = swatch.value === INK ? THEME[theme].ink : swatch.value
        return (
          <button
            key={swatch.value}
            type="button"
            role="radio"
            aria-checked={value === swatch.value}
            aria-label={accessible}
            title={accessible}
            onClick={() => onChange(swatch.value)}
            className={cx(
              'relative h-7 w-7 rounded-lg border transition-transform hover:scale-110',
              value === swatch.value ? 'border-accent ring-2 ring-accent ring-offset-1 ring-offset-panel-solid' : 'border-line-strong',
            )}
            style={
              swatch.value === NONE
                ? { background: 'linear-gradient(135deg, transparent 45%, var(--danger) 45%, var(--danger) 55%, transparent 55%)' }
                : { background: color }
            }
          />
        )
      })}
    </div>
  )
}

const StrokeWidthIcon = ({ width }: { width: number }) => (
  <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
    <path d="M2 10 C 7 2, 14 2, 20 6" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" />
  </svg>
)

export const StylePanel = ({ mobileOpen }: { mobileOpen: boolean }) => {
  const { engine, session } = useBoard()
  const t = useUi((s) => s.t)
  const tool = useUi((s) => s.tool)
  const style = useUi((s) => s.style)
  const selection = useUi((s) => s.selection)
  const editingText = useUi((s) => s.editingText)
  if (session.readOnly) return null

  const types: ElementType[] = selection ? selection.types : (TOOL_TYPES[tool] ? [TOOL_TYPES[tool]] : [])
  if (types.length === 0) return null

  const pick = <K extends keyof ToolStyle>(key: K, fromSelection: ToolStyle[K] | null | undefined): ToolStyle[K] | null =>
    selection ? (fromSelection ?? null) : style[key]

  const apply = (patch: Partial<ToolStyle>) => engine.applyStyle(patch)
  const has = (list: ElementType[]) => types.some((type) => list.includes(type))
  const showStroke = has([...STROKED, 'text'])
  const showFill = has(SHAPES)
  const showSticky = types.includes('sticky')
  const showWidth = has(STROKED)
  const showDash = has([...SHAPES, 'line', 'arrow'])
  const showFont = types.includes('text') || types.includes('sticky') || (selection !== null && has(SHAPES))
  const stickyValue = selection ? (selection.types.length === 1 ? selection.fill : null) : style.sticky
  const opacity = pick('opacity', selection?.opacity) ?? 1

  return (
    <Panel
      aria-label={t('style.panel')}
      role="region"
      className={cx(
        'z-20 w-[min(17rem,calc(100vw-1rem))] space-y-3.5 p-3.5',
        'absolute left-[4.6rem] top-20 max-h-[calc(100%-6.5rem)] overflow-y-auto',
        'max-sm:left-2 max-sm:right-2 max-sm:top-auto max-sm:bottom-[4.4rem] max-sm:w-auto max-sm:max-h-[45vh]',
        !mobileOpen && 'max-sm:hidden',
        editingText && 'max-sm:hidden',
      )}
    >
      {showStroke && (
        <Section title={t('style.stroke')}>
          <Swatches swatches={STROKE_SWATCHES} value={pick('stroke', selection?.stroke)} onChange={(stroke) => apply({ stroke })} label={t('style.stroke')} />
        </Section>
      )}
      {showFill && (
        <Section title={t('style.fill')}>
          <Swatches swatches={FILL_SWATCHES} value={pick('fill', selection?.fill)} onChange={(fill) => apply({ fill })} label={t('style.fill')} />
        </Section>
      )}
      {showSticky && (
        <Section title={t('style.sticky')}>
          <Swatches swatches={STICKY_SWATCHES} value={stickyValue} onChange={(sticky) => apply({ sticky })} label={t('style.sticky')} />
        </Section>
      )}
      {(showWidth || showDash) && (
        <div className="flex flex-wrap items-end gap-3">
          {showWidth && (
            <Section title={t('style.width')}>
              <Segmented
                label={t('style.width')}
                value={pick('strokeWidth', selection?.strokeWidth)}
                onChange={(strokeWidth) => apply({ strokeWidth })}
                options={[
                  { value: 2, label: <StrokeWidthIcon width={1.5} />, title: t('style.width.thin') },
                  { value: 4, label: <StrokeWidthIcon width={3} />, title: t('style.width.medium') },
                  { value: 8, label: <StrokeWidthIcon width={5} />, title: t('style.width.bold') },
                ]}
              />
            </Section>
          )}
          {showDash && (
            <label className="mb-1 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={pick('strokeStyle', selection?.strokeStyle) === 'dashed'}
                onChange={(e) => apply({ strokeStyle: e.target.checked ? 'dashed' : 'solid' })}
              />
              {t('style.dashed')}
            </label>
          )}
        </div>
      )}
      {showFont && (
        <Section title={t('style.fontSize')}>
          <Segmented
            label={t('style.fontSize')}
            value={pick('fontSize', selection?.fontSize)}
            onChange={(fontSize) => apply({ fontSize })}
            options={[
              { value: 16, label: 'S', title: 'S · 16' },
              { value: 20, label: 'M', title: 'M · 20' },
              { value: 28, label: 'L', title: 'L · 28' },
              { value: 40, label: 'XL', title: 'XL · 40' },
            ]}
          />
        </Section>
      )}
      <Section title={t('style.opacity')}>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(opacity * 100)}
          aria-label={t('style.opacity')}
          aria-valuetext={`${Math.round(opacity * 100)}%`}
          onChange={(e) => apply({ opacity: Number(e.target.value) / 100 })}
          className="w-full accent-[var(--accent)]"
        />
      </Section>
      {selection && (
        <div className="flex flex-wrap items-center gap-0.5 border-t border-line pt-2.5" role="group" aria-label={t('style.actions')}>
          <IconButton label={t('style.toBack')} shortcut="Ctrl+[" tipSide="top" onClick={() => engine.reorder('back')}>
            <ArrowDownToLine size={18} aria-hidden />
          </IconButton>
          <IconButton label={t('style.backward')} shortcut="[" tipSide="top" onClick={() => engine.reorder('backward')}>
            <ChevronDown size={18} aria-hidden />
          </IconButton>
          <IconButton label={t('style.forward')} shortcut="]" tipSide="top" onClick={() => engine.reorder('forward')}>
            <ChevronUp size={18} aria-hidden />
          </IconButton>
          <IconButton label={t('style.toFront')} shortcut="Ctrl+]" tipSide="top" onClick={() => engine.reorder('front')}>
            <ArrowUpToLine size={18} aria-hidden />
          </IconButton>
          <div className="mx-1 h-6 w-px bg-line" aria-hidden />
          <IconButton label={t('style.duplicate')} shortcut="Ctrl+D" tipSide="top" onClick={() => engine.duplicateSelection()}>
            <CopyPlus size={18} aria-hidden />
          </IconButton>
          <IconButton label={selection.locked ? t('style.unlock') : t('style.lock')} tipSide="top" onClick={() => engine.toggleLock()}>
            {selection.locked ? <LockOpen size={18} aria-hidden /> : <Lock size={18} aria-hidden />}
          </IconButton>
          <IconButton label={t('style.delete')} shortcut="Del" tipSide="top" disabled={selection.locked} onClick={() => engine.deleteSelection()}>
            <Trash2 size={18} aria-hidden className="text-danger" />
          </IconButton>
        </div>
      )}
    </Panel>
  )
}
