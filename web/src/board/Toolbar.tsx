import { Ellipsis, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton, Panel } from '../components/ui'
import { cx } from '../components/cx'
import type { Tool } from '../lib/types'
import { useUi } from '../store/ui'
import { useBoard } from './context'
import { GROUP_BREAKS, PICK_IMAGE_EVENT, TOOLS, type ToolDef } from './tools'

export const Toolbar = ({ onToggleStyle, styleOpen }: { onToggleStyle: () => void; styleOpen: boolean }) => {
  const { engine } = useBoard()
  const t = useUi((s) => s.t)
  const tool = useUi((s) => s.tool)
  const setTool = useUi((s) => s.setTool)
  const fileRef = useRef<HTMLInputElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const open = () => fileRef.current?.click()
    window.addEventListener(PICK_IMAGE_EVENT, open)
    return () => window.removeEventListener(PICK_IMAGE_EVENT, open)
  }, [])

  const choose = (next: Tool) => {
    setMoreOpen(false)
    if (next === 'image') {
      fileRef.current?.click()
      return
    }
    setTool(next)
  }

  const button = (def: ToolDef, tipSide: 'right' | 'top') => {
    const Icon = def.icon
    return (
      <IconButton
        key={def.tool}
        label={t(def.label)}
        shortcut={def.key}
        tipSide={tipSide}
        active={tool === def.tool}
        aria-pressed={def.tool === 'image' ? undefined : tool === def.tool}
        data-tool={def.tool}
        className="max-sm:w-[38px]"
        onClick={() => choose(def.tool)}
      >
        <Icon size={20} strokeWidth={1.9} aria-hidden />
      </IconButton>
    )
  }

  const secondary = TOOLS.filter((d) => !d.mobile)

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void engine.insertImage(file)
          e.target.value = ''
        }}
      />

      {/* Desktop: vertical toolbar on the left */}
      <Panel
        role="toolbar"
        aria-label={t('toolbar.label')}
        aria-orientation="vertical"
        className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-0.5 p-1.5 sm:flex"
      >
        {TOOLS.map((def) => (
          <div key={def.tool} className="flex flex-col">
            {GROUP_BREAKS.has(def.tool) && <div className="mx-2 my-1 h-px bg-line" aria-hidden />}
            {button(def, 'right')}
          </div>
        ))}
      </Panel>

      {/* Phone: bottom bar with the most used tools, the rest in a menu */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden">
        {moreOpen && (
          <Panel className="animate-pop mb-2 ml-auto flex w-fit flex-wrap justify-end gap-1 p-1.5" role="menu" aria-label={t('tool.more')}>
            {secondary.map((def) => button(def, 'top'))}
          </Panel>
        )}
        <Panel role="toolbar" aria-label={t('toolbar.label')} className="flex items-center justify-between gap-0.5 p-1">
          {TOOLS.filter((d) => d.mobile).map((def) => button(def, 'top'))}
          <div className="mx-0.5 h-6 w-px bg-line" aria-hidden />
          <IconButton
            label={t('tool.more')}
            tipSide="top"
            className="max-sm:w-[38px]"
            active={moreOpen || secondary.some((d) => d.tool === tool)}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <Ellipsis size={20} aria-hidden />
          </IconButton>
          <IconButton label={t('style.panel')} tipSide="top" className={cx('max-sm:w-[38px]', styleOpen && 'bg-accent-soft')} aria-expanded={styleOpen} onClick={onToggleStyle}>
            <Palette size={20} aria-hidden />
          </IconButton>
        </Panel>
      </div>
    </>
  )
}
