import { useCallback, useEffect, useState } from 'react'
import { BoardEngine } from '../canvas/engine'
import { BoardSession } from '../collab/session'
import { loadUser } from '../collab/user'
import { WS_URL } from '../config'
import { buildDemo } from '../lib/demo'
import { ROOM_ID_PATTERN, VIEW_ID_PATTERN } from '../lib/ids'
import { clearPendingSeed, peekPendingSeed, touchRecent } from '../lib/storage'
import { TEMPLATE_IDS, buildTemplate, type TemplateId } from '../lib/templates'
import type { Tool } from '../lib/types'
import { NotFound } from '../pages/NotFound'
import { useUi } from '../store/ui'
import { ExportDialog, HelpDialog, ShareDialog } from './Dialogs'
import { EmptyHint, FollowBanner, WakingNotice, ZoomControls } from './Overlays'
import { StylePanel } from './StylePanel'
import { Toolbar } from './Toolbar'
import { PICK_IMAGE_EVENT } from './tools'
import { TopBar } from './TopBar'
import { BoardContext, type BoardContextValue } from './context'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  p: 'freedraw',
  e: 'eraser',
  r: 'rect',
  o: 'ellipse',
  d: 'diamond',
  a: 'arrow',
  l: 'line',
  t: 'text',
  s: 'sticky',
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)

/** Global keyboard shortcuts for the board (ignored while typing or inside dialogs). */
const useShortcuts = (engine: BoardEngine | null, readOnly: boolean) => {
  useEffect(() => {
    if (!engine) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      const ui = useUi.getState()
      if (ui.dialog) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key
      if (key === ' ' && !mod) {
        engine.setSpacePressed(true)
        if (e.target === document.body || (e.target as HTMLElement).classList.contains('board-root')) e.preventDefault()
        return
      }
      if (key === '?') {
        e.preventDefault()
        ui.setDialog('help')
        return
      }
      if (mod) {
        const lower = key.toLowerCase()
        if (lower === 'z') {
          e.preventDefault()
          if (e.shiftKey) engine.redo()
          else engine.undo()
        } else if (lower === 'y') {
          e.preventDefault()
          engine.redo()
        } else if (lower === 'd') {
          e.preventDefault()
          engine.duplicateSelection()
        } else if (lower === 'a') {
          e.preventDefault()
          engine.selectAll()
        } else if (lower === 'c') {
          if (engine.selectedIds.length > 0) engine.copySelection()
        } else if (lower === 'x') {
          if (engine.selectedIds.length > 0) engine.cutSelection()
        } else if (key === ']') {
          e.preventDefault()
          engine.reorder('front')
        } else if (key === '[') {
          e.preventDefault()
          engine.reorder('back')
        } else if (key === '=' || key === '+') {
          e.preventDefault()
          engine.zoomBy(1.2)
        } else if (key === '-') {
          e.preventDefault()
          engine.zoomBy(1 / 1.2)
        } else if (key === '0') {
          e.preventDefault()
          engine.zoomTo(1)
        }
        return
      }
      if (e.altKey) return
      switch (key) {
        case 'Escape':
          if (ui.following !== null) engine.follow(null)
          else {
            engine.clearSelection()
            ui.setTool('select')
          }
          return
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          engine.deleteSelection()
          return
        case 'Enter':
          if (engine.selectedIds.length === 1) {
            e.preventDefault()
            engine.editSelected()
          }
          return
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (engine.selectedIds.length === 0) return
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
          const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
          engine.nudge(dx, dy)
          return
        }
        case ']':
          engine.reorder('forward')
          return
        case '[':
          engine.reorder('backward')
          return
        case '+':
        case '=':
          engine.zoomBy(1.2)
          return
        case '-':
          engine.zoomBy(1 / 1.2)
          return
        case '0':
          engine.zoomTo(1)
          return
        case '!':
          engine.zoomToFit()
          return
      }
      if (e.shiftKey && e.code === 'Digit1') {
        engine.zoomToFit()
        return
      }
      if (e.shiftKey) return
      const lower = key.toLocaleLowerCase('en')
      if (readOnly) {
        if (lower === 'v' || lower === 'h') ui.setTool(TOOL_KEYS[lower])
        return
      }
      if (lower === 'i') {
        window.dispatchEvent(new Event(PICK_IMAGE_EVENT))
        return
      }
      if (lower in TOOL_KEYS) ui.setTool(TOOL_KEYS[lower])
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') engine.setSpacePressed(false)
    }
    const onBlur = () => engine.setSpacePressed(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [engine, readOnly])
}

/** Keeps the "recent boards" entry (title + thumbnail) fresh while the board is open. */
const useRecentEntry = (engine: BoardEngine | null, kind: 'r' | 'v', id: string) => {
  useEffect(() => {
    if (!engine) return
    const meta = engine.session.model.meta
    let dirty = true
    const markDirty = () => {
      dirty = true
    }
    const save = () => {
      if (!dirty) return
      dirty = false
      touchRecent({ kind, id, title: (meta.get('title') as string | undefined) ?? '', thumb: engine.renderThumbnail() ?? undefined })
    }
    engine.session.doc.on('update', markDirty)
    const first = setTimeout(save, 1500)
    const timer = setInterval(save, 8000)
    window.addEventListener('pagehide', save)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      window.removeEventListener('pagehide', save)
      engine.session.doc.off('update', markDirty)
      save()
    }
  }, [engine, kind, id])
}

const BoardView = ({ session, kind, id }: { session: BoardSession; kind: 'r' | 'v'; id: string }) => {
  const t = useUi((s) => s.t)
  const tool = useUi((s) => s.tool)
  const count = useUi((s) => s.elementCount)
  const [engine, setEngine] = useState<BoardEngine | null>(null)
  const [styleOpen, setStyleOpen] = useState(false)

  // React 19 ref callbacks may return a cleanup: the engine lives exactly as long as the DOM node.
  const rootRef = useCallback(
    (root: HTMLDivElement | null) => {
      if (!root) return
      const canvas = root.querySelector('canvas')
      const cursorRoot = root.querySelector<HTMLDivElement>('[data-cursors]')
      if (!canvas || !cursorRoot) return
      const created = new BoardEngine({ root, canvas, cursorRoot, session })
      setEngine(created)
      return () => {
        created.destroy()
        setEngine(null)
      }
    },
    [session],
  )

  useShortcuts(engine, session.readOnly)
  useRecentEntry(engine, kind, id)

  const context: BoardContextValue | null = engine ? { engine, session, kind, id } : null

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg text-fg">
      <div
        ref={rootRef}
        className="board-root absolute inset-0 touch-none select-none outline-none"
        tabIndex={0}
        role="application"
        aria-roledescription="whiteboard"
        aria-label={t('board.canvasLabel', { count, tool: t(`tool.${tool}`) })}
        data-testid="board"
      >
        <canvas className="absolute inset-0 block" aria-hidden="true" />
        <div data-cursors className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      {context && (
        <BoardContext.Provider value={context}>
          <EmptyHint />
          <TopBar />
          {!session.readOnly && <Toolbar styleOpen={styleOpen} onToggleStyle={() => setStyleOpen((v) => !v)} />}
          <StylePanel mobileOpen={styleOpen} />
          <ZoomControls />
          <FollowBanner />
          <WakingNotice />
          <ShareDialog />
          <ExportDialog />
          <HelpDialog />
        </BoardContext.Provider>
      )}
    </div>
  )
}

const resolveSeed = (template: string) => {
  const t = useUi.getState().t
  if (template === 'demo') return { content: buildDemo(t), title: t('demo.title') }
  if ((TEMPLATE_IDS as string[]).includes(template)) {
    const id = template as TemplateId
    return { content: buildTemplate(id, t), title: id === 'blank' ? '' : t(`template.${id}`) }
  }
  return null
}

export default function BoardPage({ kind, id }: { kind: 'r' | 'v'; id: string }) {
  const valid = kind === 'r' ? ROOM_ID_PATTERN.test(id) : VIEW_ID_PATTERN.test(id)
  const [session, setSession] = useState<BoardSession | null>(null)
  const t = useUi((s) => s.t)

  useEffect(() => {
    if (!valid) return
    const ui = useUi.getState()
    ui.patch({ tool: 'select', selection: null, following: null, peers: [], elementCount: 0, dialog: null })
    const created = new BoardSession({
      roomName: `${kind}/${id}`,
      readOnly: kind === 'v',
      user: loadUser(ui.t),
      wsUrl: WS_URL,
    })
    const off = created.onConnection((connection) => useUi.getState().patch({ connection }))
    const state = { cancelled: false }
    const isCancelled = () => state.cancelled
    // Wait for the local copy (IndexedDB) so the first frame already shows the board.
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500))
    void Promise.race([created.localReady, timeout]).then(async () => {
      if (isCancelled()) return
      const template = kind === 'r' ? peekPendingSeed(id) : null
      if (template) {
        await document.fonts.ready
        if (isCancelled()) return
        const seed = resolveSeed(template)
        if (seed) created.seed(seed.content, seed.title)
        clearPendingSeed(id)
      }
      touchRecent({ kind, id, title: (created.model.meta.get('title') as string | undefined) ?? '' })
      setSession(created)
    })
    return () => {
      state.cancelled = true
      off()
      created.destroy()
      setSession(null)
    }
  }, [kind, id, valid])

  if (!valid) return <NotFound />
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-muted" role="status">
        {t('board.loading')}
      </div>
    )
  }
  return <BoardView session={session} kind={kind} id={id} />
}
