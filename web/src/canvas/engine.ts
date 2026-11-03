import type * as Y from 'yjs'
import type { BoardSession } from '../collab/session'
import { lineElement, normalizeFreedraw } from '../lib/builders'
import { THEME, type ThemeName } from '../lib/colors'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  boxCenter,
  boxesIntersect,
  clamp,
  distance,
  elementBounds,
  elementCorners,
  elementsInBox,
  fitBounds,
  frameOf,
  groupHandlePositions,
  handleCursor,
  handlePositions,
  hitTest,
  hitTestTopmost,
  isResizeHandle,
  localPoints,
  localToWorld,
  normalizeBox,
  resizeFrame,
  rotatePoint,
  scaleFrameBetween,
  screenToWorld,
  selectionBounds,
  snapAngle,
  unionBoxes,
  visibleWorld,
  worldToScreen,
  zoomAt,
} from '../lib/geometry'
import { cloneInput, compareElements, readElement, type ElementPatch, type YElement } from '../lib/model'
import { drawElement, drawElementTiny } from '../lib/render'
import { round, simplifyPoints, simulatedPressure, streamline, toFlat, toStrokePoints, type StrokePoint } from '../lib/stroke'
import { textBlockSize } from '../lib/text'
import type { Box, Camera, ElementData, ElementInput, Handle, Peer, PresenceState, Tool, Vec } from '../lib/types'
import { useUi, type SelectionInfo, type ToolStyle } from '../store/ui'
import { CursorLayer } from './cursors'
import { ImageCache, MAX_BOARD_IMAGE_BYTES, assetIdFor, processImage } from './images'
import { TextEditor } from './textEditor'

type Mods = { shift: boolean; alt: boolean; mod: boolean }

type Gesture =
  | { kind: 'pan'; start: Vec; cam0: Camera }
  | { kind: 'move'; start: Vec; origins: Map<string, Vec>; moved: boolean }
  | { kind: 'resize'; handle: Handle; els0: ElementData[]; box0: Box; single: boolean }
  | { kind: 'rotate'; center: Vec; startAngle: number; els0: ElementData[]; single: boolean }
  | { kind: 'endpoint'; which: 'start' | 'end'; el0: ElementData }
  | { kind: 'marquee'; start: Vec; base: Set<string> }
  | { kind: 'lockedPending'; id: string; start: Vec; startScreen: Vec }
  | { kind: 'shape'; id: string; start: Vec; type: 'rect' | 'ellipse' | 'diamond' }
  | { kind: 'line'; id: string; start: Vec; type: 'line' | 'arrow' }
  | { kind: 'draw'; id: string; origin: Vec; last: StrokePoint; lastScreen: Vec; buffer: number[] }
  | { kind: 'erase'; last: Vec }

interface PendingTouch {
  pointerId: number
  screen: Vec
  time: number
}

interface RemoteSelection {
  ids: string[]
  color: string
  name: string
}

const TEXT_TYPES = new Set(['text', 'sticky', 'rect', 'ellipse', 'diamond'])
const DEFAULT_SIZES: Record<'rect' | 'ellipse' | 'diamond', [number, number]> = {
  rect: [180, 110],
  ellipse: [150, 150],
  diamond: [180, 130],
}

const ERASER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><circle cx='10' cy='10' r='7' fill='white' fill-opacity='0.6' stroke='%231b1f2a' stroke-width='1.5'/></svg>\") 10 10, crosshair"

const isTextTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

interface ClipboardData {
  pano: 1
  elements: ElementData[]
  assets: Record<string, string>
}

export interface EngineDeps {
  root: HTMLDivElement
  canvas: HTMLCanvasElement
  cursorRoot: HTMLDivElement
  session: BoardSession
}

/**
 * The imperative heart of the board: owns the camera, the render loop, the
 * pointer state machine and the bridge between the Y.Doc and the canvas.
 * React only renders chrome around it and talks to it through methods and the
 * Zustand UI store, so pointer moves never trigger React renders.
 */
export class BoardEngine {
  readonly session: BoardSession
  camera: Camera = { x: -320, y: -220, zoom: 1 }
  private readonly root: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly cursors: CursorLayer
  private readonly images: ImageCache
  private viewport = { w: 1, h: 1 }
  private dpr = 1
  private readonly elements = new Map<string, ElementData>()
  private readonly bounds = new Map<string, Box>()
  private sorted: ElementData[] = []
  private sortDirty = true
  private versionSeq = 0
  private selection = new Set<string>()
  private gesture: Gesture | null = null
  private gestureMods: Mods = { shift: false, alt: false, mod: false }
  private latestPointer: Vec | null = null
  private readonly pointers = new Map<number, Vec>()
  private pendingTouch: PendingTouch | null = null
  private pinch: { dist0: number; mid0: Vec; cam0: Camera } | null = null
  private spacePressed = false
  private needsRender = true
  private rafId = 0
  private lastFrame = 0
  private editor: TextEditor | null = null
  private editingId: string | null = null
  private readonly erasing = new Set<string>()
  private marquee: Box | null = null
  private following: number | null = null
  private remoteSelections = new Map<number, RemoteSelection>()
  private peersKey = ''
  private autoFit = true
  private autoFitTimer: ReturnType<typeof setTimeout> | null = null
  private autoFitStop: ReturnType<typeof setTimeout> | null = null
  private lastCursorSent = 0
  private viewportTimer: ReturnType<typeof setTimeout> | null = null
  private hoverWorld: Vec | null = null
  private clipboard: ClipboardData | null = null
  private readonly cleanups: (() => void)[] = []
  private destroyed = false

  constructor(deps: EngineDeps) {
    this.session = deps.session
    this.root = deps.root
    this.canvas = deps.canvas
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx
    this.cursors = new CursorLayer(deps.cursorRoot)
    this.images = new ImageCache(() => this.invalidate())

    this.session.model.elements.forEach((ymap, id) => this.readInto(id, ymap))
    this.sortDirty = true

    const { model, undo, awareness } = this.session
    model.elements.observeDeep(this.handleElementsChange)
    model.assets.observe(this.handleAssetsChange)
    awareness.on('change', this.handleAwarenessChange)
    const updateUndo = () => useUi.getState().patch({ canUndo: undo.undoStack.length > 0, canRedo: undo.redoStack.length > 0 })
    undo.on('stack-item-added', updateUndo)
    undo.on('stack-item-popped', updateUndo)
    undo.on('stack-cleared', updateUndo)
    updateUndo()
    this.cleanups.push(() => {
      model.elements.unobserveDeep(this.handleElementsChange)
      model.assets.unobserve(this.handleAssetsChange)
      awareness.off('change', this.handleAwarenessChange)
      undo.off('stack-item-added', updateUndo)
      undo.off('stack-item-popped', updateUndo)
      undo.off('stack-cleared', updateUndo)
    })

    const root = this.root
    root.addEventListener('pointerdown', this.handlePointerDown)
    root.addEventListener('pointermove', this.handlePointerMove)
    root.addEventListener('pointerup', this.handlePointerUp)
    root.addEventListener('pointercancel', this.handlePointerUp)
    root.addEventListener('pointerleave', this.handlePointerLeave)
    root.addEventListener('wheel', this.handleWheel, { passive: false })
    root.addEventListener('dblclick', this.handleDoubleClick)
    root.addEventListener('dragover', this.handleDragOver)
    root.addEventListener('drop', this.handleDrop)
    root.addEventListener('contextmenu', this.handleContextMenu)
    window.addEventListener('paste', this.handlePaste)
    this.cleanups.push(() => {
      root.removeEventListener('pointerdown', this.handlePointerDown)
      root.removeEventListener('pointermove', this.handlePointerMove)
      root.removeEventListener('pointerup', this.handlePointerUp)
      root.removeEventListener('pointercancel', this.handlePointerUp)
      root.removeEventListener('pointerleave', this.handlePointerLeave)
      root.removeEventListener('wheel', this.handleWheel)
      root.removeEventListener('dblclick', this.handleDoubleClick)
      root.removeEventListener('dragover', this.handleDragOver)
      root.removeEventListener('drop', this.handleDrop)
      root.removeEventListener('contextmenu', this.handleContextMenu)
      window.removeEventListener('paste', this.handlePaste)
    })

    const observer = new ResizeObserver(() => this.resize())
    observer.observe(root)
    this.cleanups.push(() => observer.disconnect())

    let prevTool = useUi.getState().tool
    let prevTheme = useUi.getState().resolvedTheme
    const unsubscribe = useUi.subscribe((state) => {
      if (state.tool !== prevTool) {
        prevTool = state.tool
        this.handleToolChange(state.tool)
      }
      if (state.resolvedTheme !== prevTheme) {
        prevTheme = state.resolvedTheme
        this.invalidate()
      }
    })
    this.cleanups.push(unsubscribe)

    // Fit the content while the board is loading; stop shortly after the first
    // server sync so later remote edits never move a passive viewer's camera.
    const offConnection = this.session.onConnection((info) => {
      if (info.everSynced && this.autoFit && !this.autoFitStop) {
        this.scheduleAutoFit()
        this.autoFitStop = setTimeout(() => this.claimCamera(), 500)
      }
    })
    this.cleanups.push(offConnection)

    this.resize()
    this.publishCount()
    this.handleAwarenessChange()
    this.scheduleAutoFit()
    this.updateCursorStyle()
    this.installDebugHandle()
  }

  /* ------------------------------------------------------------ helpers */

  private get ui() {
    return useUi.getState()
  }

  private get theme(): ThemeName {
    return this.ui.resolvedTheme
  }

  private get readOnly() {
    return this.session.readOnly
  }

  get selectedIds(): string[] {
    return [...this.selection]
  }

  get elementCount() {
    return this.elements.size
  }

  private sortedElements(): ElementData[] {
    if (this.sortDirty) {
      this.sorted = [...this.elements.values()].sort(compareElements)
      this.sortDirty = false
    }
    return this.sorted
  }

  private selectedElements(): ElementData[] {
    return this.sortedElements().filter((el) => this.selection.has(el.id))
  }

  private screenPoint(e: { clientX: number; clientY: number }): Vec {
    const rect = this.root.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private toWorld(p: Vec) {
    return screenToWorld(this.camera, p)
  }

  private readInto(id: string, ymap: YElement, changedKeys?: Set<string>) {
    const prev = this.elements.get(id)
    const reuse = prev && changedKeys && !changedKeys.has('points') ? prev.points : undefined
    const el = readElement(id, ymap, ++this.versionSeq, reuse)
    this.elements.set(id, el)
    this.bounds.set(id, elementBounds(el))
    if (!prev || prev.z !== el.z) this.sortDirty = true
    else {
      // Keep the sorted array in sync without a full re-sort.
      const index = this.sorted.indexOf(prev)
      if (index >= 0) this.sorted[index] = el
      else this.sortDirty = true
    }
  }

  invalidate() {
    this.needsRender = true
    this.requestFrame()
  }

  private requestFrame() {
    if (this.rafId || this.destroyed) return
    this.rafId = requestAnimationFrame(this.frame)
  }

  /* ------------------------------------------------------ doc observers */

  private readonly handleElementsChange = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const changed = new Map<string, Set<string> | undefined>()
    for (const event of events) {
      if (event.target === this.session.model.elements) {
        for (const key of event.changes.keys.keys()) changed.set(key, undefined)
        continue
      }
      const id = event.path[0]
      if (typeof id !== 'string') continue
      if (changed.has(id) && changed.get(id) === undefined) continue
      const keys = changed.get(id) ?? new Set<string>()
      if (event.path.length === 1) for (const key of event.changes.keys.keys()) keys.add(key)
      else keys.add(String(event.path[1]))
      changed.set(id, keys)
    }
    let selectionChanged = false
    let selectedTouched = false
    for (const [id, keys] of changed) {
      const ymap = this.session.model.elements.get(id)
      if (!ymap) {
        const prev = this.elements.get(id)
        if (prev) {
          this.elements.delete(id)
          this.bounds.delete(id)
          this.sortDirty = true
        }
        if (this.selection.delete(id)) selectionChanged = true
        if (this.editingId === id) this.editor?.commit()
        continue
      }
      this.readInto(id, ymap, keys)
      if (this.selection.has(id)) selectedTouched = true
    }
    if (selectionChanged) this.emitSelection()
    else if (selectedTouched) this.ui.patch({ selection: this.summarizeSelection() })
    this.publishCount()
    if (this.autoFit) this.scheduleAutoFit()
    this.invalidate()
  }

  private readonly handleAssetsChange = () => this.invalidate()

  private publishCount() {
    if (this.ui.elementCount !== this.elements.size) this.ui.patch({ elementCount: this.elements.size })
  }

  /* -------------------------------------------------------- presence */

  private readonly handleAwarenessChange = () => {
    const states = this.session.awareness.getStates() as Map<number, PresenceState | null>
    const self = this.session.doc.clientID
    const seen = new Set<number>()
    const selections = new Map<number, RemoteSelection>()
    const peers: Peer[] = []
    for (const [clientId, state] of states) {
      if (!state?.user) continue
      const isSelf = clientId === self
      peers.push({
        clientId,
        user: state.user,
        selection: state.selection,
        viewport: state.viewport,
        readOnly: Boolean(state.readOnly),
        isSelf,
      })
      if (isSelf) continue
      seen.add(clientId)
      this.cursors.upsert(clientId, state.user.name, state.user.color, state.cursor)
      if (state.selection.length > 0) selections.set(clientId, { ids: state.selection, color: state.user.color, name: state.user.name })
    }
    this.cursors.retain(seen)
    const selectionKey = (m: Map<number, RemoteSelection>) => JSON.stringify([...m.entries()].map(([k, v]) => [k, v.ids, v.color]))
    if (selectionKey(selections) !== selectionKey(this.remoteSelections)) {
      this.remoteSelections = selections
      this.needsRender = true
    }
    peers.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.user.name.localeCompare(b.user.name))
    const key = JSON.stringify(peers.map((p) => [p.clientId, p.user.name, p.user.color, p.readOnly]))
    if (key !== this.peersKey) {
      this.peersKey = key
      this.ui.patch({ peers })
    }
    if (this.following !== null && !seen.has(this.following)) this.follow(null)
    this.requestFrame()
  }

  private sendCursor(world: Vec | null) {
    if (world === null) {
      this.session.setPresence({ cursor: null })
      return
    }
    const now = performance.now()
    if (now - this.lastCursorSent < 40) return
    this.lastCursorSent = now
    this.session.setPresence({ cursor: { x: round(world.x, 2), y: round(world.y, 2) } })
  }

  private publishViewport() {
    if (this.viewportTimer) return
    this.viewportTimer = setTimeout(() => {
      this.viewportTimer = null
      const v = visibleWorld(this.camera, this.viewport)
      this.session.setPresence({ viewport: { x: round(v.x, 2), y: round(v.y, 2), w: round(v.w, 2), h: round(v.h, 2) } })
    }, 120)
  }

  follow(clientId: number | null) {
    this.following = clientId
    this.ui.patch({ following: clientId })
    if (clientId !== null) this.autoFit = false
    this.requestFrame()
  }

  private followStep(dt: number): boolean {
    const state = this.session.awareness.getStates().get(this.following ?? -1) as PresenceState | undefined
    const box = state?.viewport
    if (!box) return false
    const zoom = clamp(Math.min(this.viewport.w / box.w, this.viewport.h / box.h), MIN_ZOOM, MAX_ZOOM)
    const c = boxCenter(box)
    const target = { x: c.x - this.viewport.w / 2 / zoom, y: c.y - this.viewport.h / 2 / zoom, zoom }
    const k = 1 - Math.exp(-dt / 90)
    const cam = this.camera
    const nextZoom = Math.exp(Math.log(cam.zoom) + (Math.log(target.zoom) - Math.log(cam.zoom)) * k)
    // Interpolate the centre, then derive the corner for the new zoom.
    const cc = { x: cam.x + this.viewport.w / 2 / cam.zoom, y: cam.y + this.viewport.h / 2 / cam.zoom }
    const nc = { x: cc.x + (c.x - cc.x) * k, y: cc.y + (c.y - cc.y) * k }
    this.setCamera({ x: nc.x - this.viewport.w / 2 / nextZoom, y: nc.y - this.viewport.h / 2 / nextZoom, zoom: nextZoom }, false)
    return Math.abs(nc.x - c.x) + Math.abs(nc.y - c.y) > 0.5 || Math.abs(nextZoom - target.zoom) > 0.001
  }

  /* --------------------------------------------------------- camera */

  setCamera(cam: Camera, userInitiated = true) {
    this.camera = { x: cam.x, y: cam.y, zoom: clamp(cam.zoom, MIN_ZOOM, MAX_ZOOM) }
    if (userInitiated) {
      this.autoFit = false
      if (this.following !== null) this.follow(null)
    }
    const zoom = Math.round(this.camera.zoom * 100) / 100
    if (this.ui.zoom !== zoom) this.ui.patch({ zoom })
    this.publishViewport()
    this.invalidate()
  }

  zoomBy(factor: number, at?: Vec) {
    const point = at ?? { x: this.viewport.w / 2, y: this.viewport.h / 2 }
    this.setCamera(zoomAt(this.camera, point, this.camera.zoom * factor))
  }

  zoomTo(zoom: number) {
    this.setCamera(zoomAt(this.camera, { x: this.viewport.w / 2, y: this.viewport.h / 2 }, zoom))
  }

  /** Fits all content (or the selection) into view. */
  zoomToFit(userInitiated = true) {
    const els = this.selection.size > 0 && userInitiated ? this.selectedElements() : this.sortedElements()
    const bounds = unionBoxes(els.map((el) => this.bounds.get(el.id) ?? elementBounds(el)))
    if (!bounds) {
      this.setCamera({ x: -this.viewport.w / 2, y: -this.viewport.h / 2, zoom: 1 }, userInitiated)
      return
    }
    const compact = this.viewport.w < 640
    const padding = compact ? 24 : 72
    const insetTop = compact ? 64 : 72
    const insetBottom = compact ? 88 : 24
    const cam = fitBounds(bounds, { w: this.viewport.w, h: this.viewport.h - insetTop - insetBottom }, padding, 1.2)
    this.setCamera({ ...cam, y: cam.y - insetTop / cam.zoom }, userInitiated)
  }

  private scheduleAutoFit() {
    if (!this.autoFit) return
    if (this.autoFitTimer) clearTimeout(this.autoFitTimer)
    this.autoFitTimer = setTimeout(() => {
      this.autoFitTimer = null
      if (this.autoFit) this.zoomToFit(false)
    }, 60)
  }

  /** Stops automatic fitting (called once the user starts interacting). */
  private claimCamera() {
    this.autoFit = false
    if (this.autoFitTimer) clearTimeout(this.autoFitTimer)
    this.autoFitTimer = null
  }

  private resize() {
    const rect = this.root.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    const centre = this.viewport.w > 1 ? screenToWorld(this.camera, { x: this.viewport.w / 2, y: this.viewport.h / 2 }) : null
    this.viewport = { w, h }
    this.dpr = dpr
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    if (centre) {
      this.camera = { ...this.camera, x: centre.x - w / 2 / this.camera.zoom, y: centre.y - h / 2 / this.camera.zoom }
    }
    if (this.autoFit) this.scheduleAutoFit()
    this.publishViewport()
    this.invalidate()
  }

  /* ---------------------------------------------------------- frame */

  private readonly frame = (time: number) => {
    this.rafId = 0
    if (this.destroyed) return
    const dt = this.lastFrame ? Math.min(64, time - this.lastFrame) : 16
    this.lastFrame = time
    let again = false
    this.flushGesture()
    if (this.following !== null && this.followStep(dt)) again = true
    if (this.cursors.frame(this.camera, dt)) again = true
    if (this.needsRender) {
      this.needsRender = false
      this.render()
    }
    this.editor?.position()
    if (again) this.requestFrame()
    else this.lastFrame = 0
  }

  private render() {
    const { ctx, dpr, camera } = this
    const theme = THEME[this.theme]
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = theme.canvas
    ctx.fillRect(0, 0, this.viewport.w, this.viewport.h)
    this.drawGrid(theme.grid)

    ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, -camera.x * camera.zoom * dpr, -camera.y * camera.zoom * dpr)
    const view = visibleWorld(camera, this.viewport)
    const margin = 40 / camera.zoom
    const padded = { x: view.x - margin, y: view.y - margin, w: view.w + margin * 2, h: view.h + margin * 2 }
    const assets = this.session.model.assets
    const options = {
      theme: this.theme,
      zoom: camera.zoom * dpr,
      getImage: (id: string) => this.images.get(id, assets.get(id)),
      editingId: this.editingId,
      fadedIds: this.erasing,
    }
    // Elements smaller than this (in device pixels) use the flat fast path.
    const tiny = 10 / (camera.zoom * dpr)
    for (const el of this.sortedElements()) {
      const b = this.bounds.get(el.id)
      if (b && !boxesIntersect(b, padded)) continue
      if (b && b.w < tiny && b.h < tiny && el.id !== this.editingId && !this.erasing.has(el.id)) drawElementTiny(ctx, el, b, this.theme)
      else drawElement(ctx, el, options)
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.drawRemoteSelections()
    this.drawSelection()
    if (this.marquee) {
      const a = worldToScreen(camera, { x: this.marquee.x, y: this.marquee.y })
      ctx.fillStyle = theme.selectionFill
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1
      ctx.setLineDash([])
      ctx.fillRect(a.x, a.y, this.marquee.w * camera.zoom, this.marquee.h * camera.zoom)
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, this.marquee.w * camera.zoom, this.marquee.h * camera.zoom)
    }
  }

  private drawGrid(color: string) {
    const { ctx, camera } = this
    let step = 24
    while (step * camera.zoom < 14) step *= 2
    const size = step * camera.zoom
    const ox = -((camera.x % step) + step) % step * camera.zoom
    const oy = -((camera.y % step) + step) % step * camera.zoom
    const dot = camera.zoom > 0.6 ? 1.6 : 1.2
    ctx.fillStyle = color
    ctx.beginPath()
    for (let x = ox; x < this.viewport.w + size; x += size) {
      for (let y = oy; y < this.viewport.h + size; y += size) {
        ctx.rect(x - dot / 2, y - dot / 2, dot, dot)
      }
    }
    ctx.fill()
  }

  private strokePolygon(points: Vec[], color: string, width: number, dash: number[] = []) {
    const { ctx } = this
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    ctx.beginPath()
    points.forEach((p, i) => {
      const s = worldToScreen(this.camera, p)
      if (i === 0) ctx.moveTo(s.x, s.y)
      else ctx.lineTo(s.x, s.y)
    })
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
  }

  private outlineOf(el: ElementData): Vec[] {
    if (el.type === 'line' || el.type === 'arrow') {
      return localPoints(el).map((p) => localToWorld(el, p))
    }
    const pad = 4 / this.camera.zoom
    const f = frameOf(el)
    const c = boxCenter(f)
    return [
      { x: f.x - pad, y: f.y - pad },
      { x: f.x + f.w + pad, y: f.y - pad },
      { x: f.x + f.w + pad, y: f.y + f.h + pad },
      { x: f.x - pad, y: f.y + f.h + pad },
    ].map((p) => rotatePoint(p, c, el.rotation))
  }

  private drawRemoteSelections() {
    const { ctx } = this
    for (const remote of this.remoteSelections.values()) {
      const els = remote.ids.map((id) => this.elements.get(id)).filter((el): el is ElementData => Boolean(el))
      if (els.length === 0) continue
      for (const el of els) this.strokePolygon(this.outlineOf(el), remote.color, 2)
      const box = unionBoxes(els.map((el) => this.bounds.get(el.id) ?? elementBounds(el)))
      if (!box) continue
      const s = worldToScreen(this.camera, { x: box.x, y: box.y })
      ctx.font = '600 11px "Inter Variable", system-ui, sans-serif'
      const w = ctx.measureText(remote.name).width + 10
      ctx.fillStyle = remote.color
      ctx.beginPath()
      ctx.roundRect(s.x - 4, s.y - 24, w, 18, 5)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillText(remote.name, s.x + 1, s.y - 15)
    }
  }

  private drawSelection() {
    const els = this.selectedElements()
    if (els.length === 0 || this.gesture?.kind === 'draw') return
    const theme = THEME[this.theme]
    const { ctx } = this
    for (const el of els) {
      const isLine = el.type === 'line' || el.type === 'arrow'
      if (isLine && els.length === 1) continue
      this.strokePolygon(this.outlineOf(el), theme.selection, 1.5, el.locked ? [4, 4] : [])
    }
    if (this.editingId || this.readOnly) return
    const handles = this.currentHandles()
    if (els.length > 1) {
      const box = selectionBounds(els)
      if (box) {
        const pad = 6 / this.camera.zoom
        this.strokePolygon(
          [
            { x: box.x - pad, y: box.y - pad },
            { x: box.x + box.w + pad, y: box.y - pad },
            { x: box.x + box.w + pad, y: box.y + box.h + pad },
            { x: box.x - pad, y: box.y + box.h + pad },
          ],
          theme.selection,
          1,
          [5, 4],
        )
      }
    }
    if (!handles) return
    for (const [name, pos] of Object.entries(handles) as [Handle, Vec][]) {
      const s = worldToScreen(this.camera, pos)
      ctx.fillStyle = theme.handleFill
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1.5
      ctx.beginPath()
      if (name === 'rotate' || name === 'start' || name === 'end') ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2)
      else ctx.roundRect(s.x - 4.5, s.y - 4.5, 9, 9, 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  /** Handles for the current selection (null when nothing is transformable). */
  private currentHandles(): Partial<Record<Handle, Vec>> | null {
    const els = this.selectedElements().filter((el) => !el.locked)
    if (els.length === 0 || els.length !== this.selection.size) return null
    if (els.length === 1) return handlePositions(els[0], this.camera.zoom)
    const box = selectionBounds(els)
    if (!box) return null
    const pad = 6 / this.camera.zoom
    return groupHandlePositions({ x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 }, this.camera.zoom)
  }

  private handleAt(screen: Vec, touch: boolean): Handle | null {
    if (this.readOnly) return null
    const handles = this.currentHandles()
    if (!handles) return null
    const radius = touch ? 18 : 9
    let best: Handle | null = null
    let bestDistance = Infinity
    for (const [name, pos] of Object.entries(handles) as [Handle, Vec][]) {
      const d = distance(worldToScreen(this.camera, pos), screen)
      if (d <= radius && d < bestDistance) {
        best = name
        bestDistance = d
      }
    }
    return best
  }

  /* -------------------------------------------------------- selection */

  setSelection(ids: Iterable<string>) {
    const next = new Set([...ids].filter((id) => this.elements.has(id)))
    if (next.size === this.selection.size && [...next].every((id) => this.selection.has(id))) return
    this.selection = next
    this.emitSelection()
  }

  private emitSelection() {
    this.session.setPresence({ selection: [...this.selection] })
    this.ui.patch({ selection: this.summarizeSelection() })
    this.invalidate()
  }

  private summarizeSelection(): SelectionInfo | null {
    const els = this.selectedElements()
    if (els.length === 0) return null
    const common = <K extends keyof ElementData>(key: K): ElementData[K] | null => {
      const values = new Set(els.map((el) => el[key]))
      return values.size === 1 ? (els[0][key] ?? null) : null
    }
    return {
      count: els.length,
      types: [...new Set(els.map((el) => el.type))],
      stroke: common('stroke'),
      fill: common('fill'),
      strokeWidth: common('strokeWidth'),
      strokeStyle: common('strokeStyle'),
      fontSize: common('fontSize') ?? null,
      opacity: common('opacity'),
      locked: els.every((el) => el.locked),
    }
  }

  clearSelection() {
    this.setSelection([])
  }

  selectAll() {
    this.setSelection(this.sortedElements().filter((el) => !el.locked).map((el) => el.id))
  }

  /* --------------------------------------------------------- tools */

  private handleToolChange(tool: Tool) {
    this.editor?.commit()
    if (tool !== 'select' && tool !== 'hand') this.clearSelection()
    this.updateCursorStyle()
  }

  private updateCursorStyle(hoverHandle?: Handle | null, overElement?: boolean) {
    const tool = this.ui.tool
    let cursor = 'default'
    if (this.gesture?.kind === 'pan') cursor = 'grabbing'
    else if (this.spacePressed || tool === 'hand') cursor = 'grab'
    else if (this.readOnly) cursor = overElement ? 'pointer' : 'grab'
    else if (tool === 'eraser') cursor = ERASER_CURSOR
    else if (tool === 'text') cursor = 'text'
    else if (tool !== 'select') cursor = 'crosshair'
    else if (hoverHandle) {
      const single = this.selection.size === 1 ? this.selectedElements()[0] : undefined
      cursor = handleCursor(hoverHandle, single?.rotation ?? 0)
    } else if (overElement) cursor = 'move'
    if (this.root.style.cursor !== cursor) this.root.style.cursor = cursor
  }

  private currentStyle(): ToolStyle {
    return this.ui.style
  }

  private finishCreation(id: string) {
    this.setSelection([id])
    this.ui.setTool('select')
  }

  /* ---------------------------------------------------- pointer events */

  private mods(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): Mods {
    return { shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey }
  }

  private readonly handlePointerDown = (e: PointerEvent) => {
    if (this.editor && e.target === this.editor.textarea) return
    if (this.editor) this.editor.commit()
    if (e.target instanceof HTMLElement && e.target !== this.root && e.target !== this.canvas) return
    // We manage focus ourselves; the default mousedown focus change would steal it
    // from a text editor opened by this very press.
    e.preventDefault()
    this.root.focus({ preventScroll: true })
    const screen = this.screenPoint(e)
    this.pointers.set(e.pointerId, screen)
    try {
      this.root.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events in tests may not be capturable.
    }

    if (e.pointerType === 'touch') {
      if (this.pointers.size === 2) {
        this.pendingTouch = null
        if (this.gesture) this.endGesture()
        this.startPinch()
        return
      }
      if (this.pointers.size > 2 || this.pinch) return
      this.pendingTouch = { pointerId: e.pointerId, screen, time: performance.now() }
      this.gestureMods = this.mods(e)
      return
    }

    if (e.button === 1 || (e.button === 0 && (this.spacePressed || this.ui.tool === 'hand'))) {
      e.preventDefault()
      this.claimCamera()
      this.gesture = { kind: 'pan', start: screen, cam0: { ...this.camera } }
      this.updateCursorStyle()
      return
    }
    if (e.button !== 0) return
    this.gestureMods = this.mods(e)
    this.startGesture(screen, this.gestureMods, e)
  }

  private readonly handlePointerMove = (e: PointerEvent) => {
    const screen = this.screenPoint(e)
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen)
    const world = this.toWorld(screen)
    this.hoverWorld = world
    if (e.pointerType !== 'touch') this.sendCursor(world)

    if (this.pinch) {
      this.updatePinch()
      return
    }
    if (this.pendingTouch && this.pendingTouch.pointerId === e.pointerId) {
      const moved = distance(screen, this.pendingTouch.screen) > 6
      if (moved || performance.now() - this.pendingTouch.time > 90) {
        const start = this.pendingTouch.screen
        this.pendingTouch = null
        this.startGesture(start, this.gestureMods, e)
      } else return
    }

    if (!this.gesture) {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        const handle = this.handleAt(screen, false)
        const over = !handle && this.ui.tool === 'select' ? hitTestTopmost(this.sortedElements(), world, 6 / this.camera.zoom) : null
        this.updateCursorStyle(handle, Boolean(over && !over.locked) || (this.readOnly && Boolean(over)))
      }
      return
    }

    this.gestureMods = this.mods(e)
    if (this.gesture.kind === 'draw') {
      const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
      for (const sample of samples.length > 0 ? samples : [e]) this.addDrawSample(this.screenPoint(sample), sample)
    }
    this.latestPointer = screen
    this.requestFrame()
  }

  private readonly handlePointerUp = (e: PointerEvent) => {
    const screen = this.screenPoint(e)
    this.pointers.delete(e.pointerId)
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null
      return
    }
    if (this.pendingTouch && this.pendingTouch.pointerId === e.pointerId) {
      // A tap: run the gesture start and end in one go.
      this.pendingTouch = null
      if (e.type === 'pointercancel') return
      this.startGesture(screen, this.gestureMods, e)
    }
    if (!this.gesture) return
    this.latestPointer = screen
    this.flushGesture()
    this.endGesture()
  }

  private readonly handlePointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') this.sendCursor(null)
  }

  private readonly handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
  }

  private startPinch() {
    const [a, b] = [...this.pointers.values()]
    this.claimCamera()
    if (this.following !== null) this.follow(null)
    this.pinch = { dist0: Math.max(1, distance(a, b)), mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam0: { ...this.camera } }
  }

  private updatePinch() {
    if (!this.pinch) return
    const pts = [...this.pointers.values()]
    if (pts.length < 2) return
    const [a, b] = pts
    const { dist0, mid0, cam0 } = this.pinch
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const zoom = clamp((cam0.zoom * distance(a, b)) / dist0, MIN_ZOOM, MAX_ZOOM)
    const anchor = screenToWorld(cam0, mid0)
    this.setCamera({ x: anchor.x - mid.x / zoom, y: anchor.y - mid.y / zoom, zoom })
  }

  private readonly handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (this.editor) this.editor.position()
    const screen = this.screenPoint(e)
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewport.h : 1
    if (e.ctrlKey || e.metaKey) {
      const delta = clamp(e.deltaY * unit, -60, 60)
      this.setCamera(zoomAt(this.camera, screen, this.camera.zoom * Math.exp(-delta * 0.01)))
      return
    }
    let dx = e.deltaX * unit
    let dy = e.deltaY * unit
    if (e.shiftKey && dx === 0) {
      dx = dy
      dy = 0
    }
    this.setCamera({ ...this.camera, x: this.camera.x + dx / this.camera.zoom, y: this.camera.y + dy / this.camera.zoom })
  }

  private readonly handleDoubleClick = (e: MouseEvent) => {
    if (this.readOnly || this.ui.tool !== 'select') return
    const world = this.toWorld(this.screenPoint(e))
    const hit = hitTestTopmost(this.sortedElements(), world, 6 / this.camera.zoom)
    if (hit && TEXT_TYPES.has(hit.type) && !hit.locked) {
      this.startEditing(hit.id)
      return
    }
    if (!hit) this.createText(world)
  }

  /* -------------------------------------------------------- gestures */

  private startGesture(screen: Vec, mods: Mods, e: PointerEvent) {
    const world = this.toWorld(screen)
    const tool = this.ui.tool
    const touch = e.pointerType === 'touch'
    const tolerance = (touch ? 12 : 6) / this.camera.zoom

    if (this.readOnly || tool === 'hand' || tool === 'image') {
      const hit = hitTestTopmost(this.sortedElements(), world, tolerance)
      this.setSelection(hit ? [hit.id] : [])
      this.claimCamera()
      this.gesture = { kind: 'pan', start: screen, cam0: { ...this.camera } }
      this.updateCursorStyle()
      return
    }

    this.claimCamera()
    switch (tool) {
      case 'select': {
        const handle = this.handleAt(screen, touch)
        if (handle) {
          this.startTransform(handle, world)
          return
        }
        const hit = hitTestTopmost(this.sortedElements(), world, tolerance)
        if (hit?.locked) {
          this.gesture = { kind: 'lockedPending', id: hit.id, start: world, startScreen: screen }
          return
        }
        if (hit) {
          if (mods.shift) {
            const next = new Set(this.selection)
            if (next.has(hit.id)) next.delete(hit.id)
            else next.add(hit.id)
            this.setSelection(next)
            return
          }
          if (!this.selection.has(hit.id)) this.setSelection([hit.id])
          this.startMove(world)
          return
        }
        if (this.selection.size > 1) {
          const box = selectionBounds(this.selectedElements())
          if (box && world.x >= box.x && world.x <= box.x + box.w && world.y >= box.y && world.y <= box.y + box.h) {
            this.startMove(world)
            return
          }
        }
        if (touch) {
          if (!mods.shift) this.clearSelection()
          this.gesture = { kind: 'pan', start: screen, cam0: { ...this.camera } }
          return
        }
        if (!mods.shift) this.clearSelection()
        this.gesture = { kind: 'marquee', start: world, base: new Set(this.selection) }
        return
      }
      case 'freedraw': {
        const style = this.currentStyle()
        const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
        this.session.beginBatch()
        const id = this.session.model.add({
          type: 'freedraw',
          x: round(world.x),
          y: round(world.y),
          w: 0,
          h: 0,
          stroke: style.stroke,
          fill: 'none',
          strokeWidth: style.strokeWidth,
          opacity: style.opacity,
          draft: true,
          points: [0, 0, round(pressure, 100)],
        })
        this.gesture = {
          kind: 'draw',
          id,
          origin: { x: round(world.x), y: round(world.y) },
          last: { x: 0, y: 0, p: pressure },
          lastScreen: screen,
          buffer: [],
        }
        return
      }
      case 'rect':
      case 'ellipse':
      case 'diamond': {
        const style = this.currentStyle()
        this.session.beginBatch()
        const id = this.session.model.add({
          type: tool,
          x: world.x,
          y: world.y,
          w: 1,
          h: 1,
          stroke: style.stroke,
          fill: style.fill,
          strokeWidth: style.strokeWidth,
          strokeStyle: style.strokeStyle,
          opacity: style.opacity,
          fontSize: style.fontSize,
        })
        this.gesture = { kind: 'shape', id, start: world, type: tool }
        return
      }
      case 'line':
      case 'arrow': {
        const style = this.currentStyle()
        this.session.beginBatch()
        const id = this.session.model.add({
          ...lineElement(tool, world, world, {
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            strokeStyle: style.strokeStyle,
            opacity: style.opacity,
          }),
        })
        this.gesture = { kind: 'line', id, start: world, type: tool }
        return
      }
      case 'text':
        this.createText(world)
        return
      case 'sticky': {
        const style = this.currentStyle()
        const size = 200
        this.session.beginBatch()
        const id = this.session.model.add({
          type: 'sticky',
          x: world.x - size / 2,
          y: world.y - size / 2,
          w: size,
          h: size,
          stroke: 'ink',
          fill: style.sticky,
          strokeWidth: 0,
          text: '',
          fontSize: 22,
          align: 'center',
          opacity: style.opacity,
        })
        this.session.endBatch()
        this.finishCreation(id)
        this.startEditing(id)
        return
      }
      case 'eraser': {
        this.session.beginBatch()
        this.gesture = { kind: 'erase', last: world }
        this.eraseAlong(world, world)
        return
      }
    }
  }

  private startMove(world: Vec) {
    const origins = new Map<string, Vec>()
    for (const el of this.selectedElements()) if (!el.locked) origins.set(el.id, { x: el.x, y: el.y })
    if (origins.size === 0) return
    this.session.beginBatch()
    this.gesture = { kind: 'move', start: world, origins, moved: false }
  }

  private startTransform(handle: Handle, world: Vec) {
    const els0 = this.selectedElements().filter((el) => !el.locked)
    if (els0.length === 0) return
    const single = els0.length === 1
    this.session.beginBatch()
    if (handle === 'start' || handle === 'end') {
      this.gesture = { kind: 'endpoint', which: handle, el0: els0[0] }
      return
    }
    const box0 = single ? frameOf(els0[0]) : (selectionBounds(els0) ?? frameOf(els0[0]))
    if (handle === 'rotate') {
      const center = boxCenter(box0)
      this.gesture = { kind: 'rotate', center, startAngle: Math.atan2(world.y - center.y, world.x - center.x), els0, single }
      return
    }
    this.gesture = { kind: 'resize', handle, els0, box0, single }
  }

  private addDrawSample(screen: Vec, e: PointerEvent) {
    const g = this.gesture
    if (g?.kind !== 'draw') return
    const world = this.toWorld(screen)
    const local = { x: world.x - g.origin.x, y: world.y - g.origin.y }
    const screenDistance = distance(screen, g.lastScreen)
    if (screenDistance < 1.2) return
    const style = this.currentStyle()
    const pressure =
      e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : simulatedPressure(g.last.p, screenDistance, style.strokeWidth * 2)
    const next = streamline(g.last, { x: local.x, y: local.y, p: pressure }, 0.32)
    g.buffer.push(round(next.x), round(next.y), round(next.p, 100))
    g.last = next
    g.lastScreen = screen
  }

  /** Applies the latest pointer position to the active gesture (at most once per frame). */
  private flushGesture() {
    const g = this.gesture
    if (!g) return
    if (g.kind === 'draw') {
      if (g.buffer.length > 0) {
        this.session.model.appendPoints(g.id, g.buffer)
        g.buffer = []
      }
      return
    }
    const screen = this.latestPointer
    if (!screen) return
    this.latestPointer = null
    const world = this.toWorld(screen)
    const mods = this.gestureMods
    const model = this.session.model
    switch (g.kind) {
      case 'pan':
        this.setCamera({
          ...g.cam0,
          x: g.cam0.x - (screen.x - g.start.x) / g.cam0.zoom,
          y: g.cam0.y - (screen.y - g.start.y) / g.cam0.zoom,
        })
        return
      case 'move': {
        let dx = world.x - g.start.x
        let dy = world.y - g.start.y
        if (mods.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        if (!g.moved && Math.hypot(dx, dy) * this.camera.zoom < 2) return
        g.moved = true
        const patches: Record<string, ElementPatch> = {}
        for (const [id, origin] of g.origins) patches[id] = { x: round(origin.x + dx, 100), y: round(origin.y + dy, 100) }
        model.updateMany(patches)
        return
      }
      case 'resize':
        this.applyResize(g, world, mods)
        return
      case 'rotate': {
        const angle = Math.atan2(world.y - g.center.y, world.x - g.center.x)
        let delta = angle - g.startAngle
        const patches: Record<string, ElementPatch> = {}
        if (g.single) {
          const el = g.els0[0]
          let rotation = el.rotation + delta
          if (mods.shift) rotation = snapAngle(rotation)
          patches[el.id] = { rotation }
        } else {
          if (mods.shift) delta = snapAngle(delta)
          for (const el of g.els0) {
            const f = frameOf(el)
            const c = rotatePoint(boxCenter(f), g.center, delta)
            patches[el.id] = { x: c.x - f.w / 2, y: c.y - f.h / 2, rotation: el.rotation + delta }
          }
        }
        model.updateMany(patches)
        return
      }
      case 'endpoint': {
        const pts = localPoints(g.el0).map((p) => localToWorld(g.el0, p))
        const fixed = g.which === 'start' ? pts[pts.length - 1] : pts[0]
        let moving = world
        if (mods.shift) moving = this.snapToAngle(fixed, world)
        const start = g.which === 'start' ? moving : fixed
        const end = g.which === 'start' ? fixed : moving
        const next = lineElement(g.el0.type as 'line' | 'arrow', start, end)
        model.update(g.el0.id, { x: next.x, y: next.y, w: next.w, h: next.h, pw: next.pw, ph: next.ph, points: next.points, rotation: 0 })
        return
      }
      case 'marquee': {
        const box = normalizeBox(g.start, world)
        this.marquee = box
        const inside = elementsInBox(this.sortedElements(), box).map((el) => el.id)
        this.setSelection(new Set([...g.base, ...inside]))
        this.invalidate()
        return
      }
      case 'lockedPending': {
        if (distance(screen, g.startScreen) > 5) {
          this.clearSelection()
          this.gesture = { kind: 'marquee', start: g.start, base: new Set() }
          this.latestPointer = screen
          this.flushGesture()
        }
        return
      }
      case 'shape': {
        let box = normalizeBox(g.start, world)
        if (mods.shift) {
          const side = Math.max(box.w, box.h)
          box = {
            x: world.x < g.start.x ? g.start.x - side : g.start.x,
            y: world.y < g.start.y ? g.start.y - side : g.start.y,
            w: side,
            h: side,
          }
        }
        model.update(g.id, { x: round(box.x, 100), y: round(box.y, 100), w: round(Math.max(1, box.w), 100), h: round(Math.max(1, box.h), 100) })
        return
      }
      case 'line': {
        const end = mods.shift ? this.snapToAngle(g.start, world) : world
        const next = lineElement(g.type, g.start, end)
        model.update(g.id, { x: next.x, y: next.y, w: next.w, h: next.h, pw: next.pw, ph: next.ph, points: next.points })
        return
      }
      case 'erase':
        this.eraseAlong(g.last, world)
        g.last = world
        return
    }
  }

  private snapToAngle(origin: Vec, point: Vec): Vec {
    const length = distance(origin, point)
    const angle = snapAngle(Math.atan2(point.y - origin.y, point.x - origin.x))
    return { x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length }
  }

  private applyResize(g: Extract<Gesture, { kind: 'resize' }>, world: Vec, mods: Mods) {
    if (!isResizeHandle(g.handle)) return
    const patches: Record<string, ElementPatch> = {}
    if (g.single) {
      const el = g.els0[0]
      const forceAspect = el.type === 'text' || el.type === 'image'
      const keepAspect = forceAspect ? !mods.shift || el.type === 'text' : mods.shift
      const next = resizeFrame(g.box0, el.rotation, g.handle, world, keepAspect, 6)
      const patch: ElementPatch = { x: next.x, y: next.y, w: next.w, h: next.h }
      if (el.type === 'text' && g.box0.h > 0) patch.fontSize = Math.max(6, round(((el.fontSize ?? 20) * next.h) / g.box0.h, 2))
      patches[el.id] = patch
    } else {
      const next = resizeFrame(g.box0, 0, g.handle, world, mods.shift, 6)
      const sy = g.box0.h > 0 ? next.h / g.box0.h : 1
      for (const el of g.els0) {
        const f = scaleFrameBetween(frameOf(el), g.box0, next)
        const patch: ElementPatch = { x: f.x, y: f.y, w: f.w, h: f.h }
        if (el.type === 'text') patch.fontSize = Math.max(6, round((el.fontSize ?? 20) * sy, 2))
        patches[el.id] = patch
      }
    }
    this.session.model.updateMany(patches)
  }

  private eraseAlong(from: Vec, to: Vec) {
    const tolerance = 8 / this.camera.zoom
    const steps = Math.max(1, Math.ceil((distance(from, to) * this.camera.zoom) / 4))
    let changed = false
    for (let i = 0; i <= steps; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
      for (const el of this.sortedElements()) {
        if (el.locked || this.erasing.has(el.id)) continue
        const b = this.bounds.get(el.id)
        if (b && (p.x < b.x - tolerance || p.x > b.x + b.w + tolerance || p.y < b.y - tolerance || p.y > b.y + b.h + tolerance)) continue
        if (hitTest(el, p, tolerance)) {
          this.erasing.add(el.id)
          changed = true
        }
      }
    }
    if (changed) this.invalidate()
  }

  private endGesture() {
    const g = this.gesture
    this.gesture = null
    if (!g) return
    const model = this.session.model
    switch (g.kind) {
      case 'pan':
        break
      case 'move':
      case 'resize':
      case 'rotate':
      case 'endpoint':
        this.session.endBatch()
        break
      case 'marquee':
        this.marquee = null
        this.invalidate()
        break
      case 'lockedPending':
        this.setSelection([g.id])
        break
      case 'shape': {
        const el = this.elements.get(g.id)
        if (el && (el.w * this.camera.zoom < 6 || el.h * this.camera.zoom < 6)) {
          const [w, h] = DEFAULT_SIZES[g.type]
          model.update(g.id, { x: g.start.x - w / 2, y: g.start.y - h / 2, w, h })
        }
        this.session.endBatch()
        this.finishCreation(g.id)
        break
      }
      case 'line': {
        const el = this.elements.get(g.id)
        if (el && Math.hypot(el.w, el.h) * this.camera.zoom < 6) {
          const next = lineElement(g.type, g.start, { x: g.start.x + 160, y: g.start.y })
          model.update(g.id, { x: next.x, y: next.y, w: next.w, h: next.h, pw: next.pw, ph: next.ph, points: next.points })
        }
        this.session.endBatch()
        this.finishCreation(g.id)
        break
      }
      case 'draw': {
        if (g.buffer.length > 0) model.appendPoints(g.id, g.buffer)
        const el = this.elements.get(g.id)
        if (el?.points) {
          const simplified = simplifyPoints(toStrokePoints(el.points), 0.3 / this.camera.zoom)
          const normalized = normalizeFreedraw(el.x, el.y, toFlat(simplified))
          model.update(g.id, { ...normalized, draft: undefined })
        }
        this.session.endBatch()
        break
      }
      case 'erase': {
        if (this.erasing.size > 0) model.remove([...this.erasing])
        this.erasing.clear()
        this.session.endBatch()
        this.invalidate()
        break
      }
    }
    this.updateCursorStyle()
  }

  /* ------------------------------------------------------------- text */

  private createText(world: Vec) {
    if (this.readOnly) return
    const style = this.currentStyle()
    const fontSize = style.fontSize
    const size = textBlockSize('', fontSize)
    this.session.beginBatch()
    const id = this.session.model.add({
      type: 'text',
      x: world.x,
      y: world.y - size.h / 2,
      w: size.w,
      h: size.h,
      stroke: style.stroke,
      fill: 'none',
      strokeWidth: 2,
      opacity: style.opacity,
      text: '',
      fontSize,
      align: 'left',
    })
    this.session.endBatch()
    this.finishCreation(id)
    this.startEditing(id)
  }

  startEditing(id: string) {
    if (this.readOnly) return
    const el = this.elements.get(id)
    if (!el || !TEXT_TYPES.has(el.type)) return
    this.editor?.commit()
    this.setSelection([id])
    this.editingId = id
    this.session.setPresence({ editing: id })
    if ((el.type === 'rect' || el.type === 'ellipse' || el.type === 'diamond') && !this.session.model.textOf(id)) {
      this.session.model.update(id, { text: '', align: 'center', fontSize: el.fontSize ?? 20 })
    }
    this.editor = new TextEditor({
      root: this.root,
      model: this.session.model,
      id,
      getElement: () => this.elements.get(id),
      getCamera: () => this.camera,
      getTheme: () => this.theme,
      label: this.ui.t('help.editText'),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onDone: (doneId) => {
        this.editor = null
        this.editingId = null
        this.session.setPresence({ editing: null })
        const done = this.elements.get(doneId)
        if (done?.type === 'text' && (done.text ?? '').trim() === '') {
          this.session.model.remove([doneId])
        }
        this.session.undo.stopCapturing()
        this.ui.patch({ editingText: false })
        this.invalidate()
        this.root.focus({ preventScroll: true })
      },
    })
    this.ui.patch({ editingText: true })
    this.invalidate()
  }

  editSelected() {
    if (this.selection.size !== 1) return
    this.startEditing([...this.selection][0])
  }

  /* --------------------------------------------------------- commands */

  undo() {
    this.session.undo.undo()
    this.setSelection([...this.selection].filter((id) => this.elements.has(id)))
  }

  redo() {
    this.session.undo.redo()
  }

  deleteSelection() {
    if (this.readOnly) return
    const ids = this.selectedElements()
      .filter((el) => !el.locked)
      .map((el) => el.id)
    if (ids.length === 0) return
    this.session.undo.stopCapturing()
    this.session.model.remove(ids)
    this.clearSelection()
  }

  duplicateSelection() {
    if (this.readOnly || this.selection.size === 0) return
    this.session.undo.stopCapturing()
    const ids = this.session.model.duplicate([...this.selection])
    this.setSelection(ids)
  }

  nudge(dx: number, dy: number) {
    if (this.readOnly) return
    const patches: Record<string, ElementPatch> = {}
    for (const el of this.selectedElements()) if (!el.locked) patches[el.id] = { x: el.x + dx, y: el.y + dy }
    this.session.model.updateMany(patches)
  }

  reorder(kind: 'front' | 'forward' | 'backward' | 'back') {
    if (this.readOnly || this.selection.size === 0) return
    const ids = [...this.selection]
    const model = this.session.model
    this.session.undo.stopCapturing()
    if (kind === 'front') model.bringToFront(ids)
    else if (kind === 'back') model.sendToBack(ids)
    else if (kind === 'forward') model.bringForward(ids)
    else model.sendBackward(ids)
    this.session.undo.stopCapturing()
  }

  toggleLock() {
    if (this.readOnly || this.selection.size === 0) return
    const els = this.selectedElements()
    const lock = !els.every((el) => el.locked)
    this.session.undo.stopCapturing()
    this.session.model.updateMany(Object.fromEntries(els.map((el) => [el.id, { locked: lock ? true : undefined }])))
    this.session.undo.stopCapturing()
  }

  /** Applies a style change to the selection (and remembers it for new elements). */
  applyStyle(patch: Partial<ToolStyle>) {
    this.ui.setStyle(patch)
    if (this.readOnly || this.selection.size === 0) return
    const patches: Record<string, ElementPatch> = {}
    for (const el of this.selectedElements()) {
      const p: ElementPatch = {}
      const shape = el.type === 'rect' || el.type === 'ellipse' || el.type === 'diamond'
      const stroked = shape || el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw'
      if (patch.stroke !== undefined && (stroked || el.type === 'text')) p.stroke = patch.stroke
      if (patch.fill !== undefined && shape) p.fill = patch.fill
      if (patch.sticky !== undefined && el.type === 'sticky') p.fill = patch.sticky
      if (patch.strokeWidth !== undefined && stroked) p.strokeWidth = patch.strokeWidth
      if (patch.strokeStyle !== undefined && stroked && el.type !== 'freedraw') p.strokeStyle = patch.strokeStyle
      if (patch.opacity !== undefined) p.opacity = patch.opacity
      if (patch.fontSize !== undefined && (el.type === 'text' || el.type === 'sticky' || (shape && el.text))) {
        p.fontSize = patch.fontSize
        if (el.type === 'text') {
          const size = textBlockSize(el.text ?? '', patch.fontSize)
          p.w = size.w
          p.h = size.h
        }
      }
      if (Object.keys(p).length > 0) patches[el.id] = p
    }
    this.session.undo.stopCapturing()
    this.session.model.updateMany(patches)
    this.session.undo.stopCapturing()
  }

  /* -------------------------------------------------- clipboard / images */

  private collectClipboard(): ClipboardData | null {
    const els = this.selectedElements()
    if (els.length === 0) return null
    const assets: Record<string, string> = {}
    for (const el of els) {
      if (el.asset) {
        const url = this.session.model.assets.get(el.asset)
        if (url) assets[el.asset] = url
      }
    }
    return { pano: 1, elements: els, assets }
  }

  copySelection() {
    const data = this.collectClipboard()
    if (!data) return
    this.clipboard = data
    void navigator.clipboard.writeText(JSON.stringify(data)).catch(() => undefined)
  }

  cutSelection() {
    this.copySelection()
    this.deleteSelection()
  }

  private pasteData(data: ClipboardData) {
    if (this.readOnly || data.elements.length === 0) return
    const box = unionBoxes(data.elements.map(elementBounds))
    const target = this.hoverWorld ?? screenToWorld(this.camera, { x: this.viewport.w / 2, y: this.viewport.h / 2 })
    const offset = box ? { x: target.x - (box.x + box.w / 2), y: target.y - (box.y + box.h / 2) } : { x: 24, y: 24 }
    const inputs: ElementInput[] = data.elements.map((el) => {
      const input = cloneInput(el)
      return { ...input, x: el.x + offset.x, y: el.y + offset.y, locked: undefined }
    })
    this.session.undo.stopCapturing()
    let ids: string[] = []
    this.session.model.transact(() => {
      for (const [id, url] of Object.entries(data.assets)) this.session.model.addAsset(id, url)
      ids = this.session.model.addMany(inputs)
    })
    this.session.undo.stopCapturing()
    this.setSelection(ids)
  }

  private readonly handlePaste = (e: ClipboardEvent) => {
    if (isTextTarget(e.target) || this.readOnly || useUi.getState().dialog) return
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) {
      e.preventDefault()
      void this.insertImage(files[0])
      return
    }
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (text.startsWith('{"pano":1')) {
      try {
        e.preventDefault()
        this.pasteData(JSON.parse(text) as ClipboardData)
        return
      } catch {
        // fall through to plain text
      }
    }
    if (text.trim() !== '') {
      e.preventDefault()
      const style = this.currentStyle()
      const value = text.slice(0, 5000)
      const size = textBlockSize(value, style.fontSize)
      const at = this.hoverWorld ?? screenToWorld(this.camera, { x: this.viewport.w / 2, y: this.viewport.h / 2 })
      this.session.undo.stopCapturing()
      const id = this.session.model.add({
        type: 'text',
        x: at.x,
        y: at.y,
        w: size.w,
        h: size.h,
        stroke: style.stroke,
        fill: 'none',
        strokeWidth: 2,
        text: value,
        fontSize: style.fontSize,
        align: 'left',
      })
      this.setSelection([id])
      return
    }
    if (this.clipboard) {
      e.preventDefault()
      this.pasteData(this.clipboard)
    }
  }

  private readonly handleDragOver = (e: DragEvent) => {
    if (this.readOnly) return
    if ([...(e.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
  }

  private readonly handleDrop = (e: DragEvent) => {
    if (this.readOnly) return
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    void this.insertImage(file, this.toWorld(this.screenPoint(e)))
  }

  /** Downscales, stores and places an image (one undo step). */
  async insertImage(file: File, at?: Vec) {
    if (this.readOnly) return
    const t = this.ui.t
    const result = await processImage(file)
    if (typeof result === 'string') {
      this.ui.showToast(result === 'tooLarge' ? t('image.tooLarge', { max: 8 }) : result === 'unsupported' ? t('image.unsupported') : t('image.failed'))
      return
    }
    const model = this.session.model
    const assetId = await assetIdFor(result.dataUrl)
    if (!model.assets.has(assetId) && model.assetBytes() + result.dataUrl.length > MAX_BOARD_IMAGE_BYTES) {
      this.ui.showToast(t('image.budget'))
      return
    }
    const maxSide = Math.min(520, (Math.min(this.viewport.w, this.viewport.h) * 0.6) / this.camera.zoom)
    const scale = Math.min(1, maxSide / Math.max(result.width, result.height))
    const w = Math.round(result.width * scale)
    const h = Math.round(result.height * scale)
    const center = at ?? screenToWorld(this.camera, { x: this.viewport.w / 2, y: this.viewport.h / 2 })
    this.session.undo.stopCapturing()
    let id = ''
    model.transact(() => {
      model.addAsset(assetId, result.dataUrl)
      id = model.add({ type: 'image', x: center.x - w / 2, y: center.y - h / 2, w, h, stroke: 'ink', fill: 'none', strokeWidth: 0, asset: assetId })
    })
    this.session.undo.stopCapturing()
    this.ui.setTool('select')
    this.setSelection([id])
  }

  /* --------------------------------------------------------- keyboard */

  setSpacePressed(pressed: boolean) {
    if (this.spacePressed === pressed) return
    this.spacePressed = pressed
    this.updateCursorStyle()
  }

  /* ----------------------------------------------------------- export */

  exportElements(scope: 'all' | 'selection'): ElementData[] {
    return scope === 'selection' && this.selection.size > 0 ? this.selectedElements() : this.sortedElements()
  }

  assetUrl = (id: string) => this.session.model.assets.get(id)

  /** Small preview for the "recent boards" list. */
  renderThumbnail(): string | null {
    const els = this.sortedElements()
    const bounds = unionBoxes(els.map((el) => this.bounds.get(el.id) ?? elementBounds(el)))
    if (!bounds) return null
    const width = 320
    const height = 200
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = THEME.light.canvas
    ctx.fillRect(0, 0, width, height)
    const cam = fitBounds(bounds, { w: width, h: height }, 12, 1)
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom)
    const assets = this.session.model.assets
    for (const el of els) {
      drawElement(ctx, el, { theme: 'light', zoom: cam.zoom, getImage: (id) => this.images.get(id, assets.get(id)) })
    }
    try {
      const webp = canvas.toDataURL('image/webp', 0.7)
      return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.7)
    } catch {
      return null
    }
  }

  /* ------------------------------------------------------------ debug */

  private installDebugHandle() {
    const handle = {
      elements: () => this.sortedElements().map((el) => ({ ...el })),
      selection: () => [...this.selection],
      camera: () => ({ ...this.camera }),
      worldToScreen: (p: Vec) => worldToScreen(this.camera, p),
      status: () => this.session.connection.status,
      peers: () => this.ui.peers.map((p) => ({ name: p.user.name, isSelf: p.isSelf })),
      undoDepth: () => this.session.undo.undoStack.length,
      fit: () => this.zoomToFit(),
      setCamera: (cam: Camera) => this.setCamera(cam),
      corners: (id: string) => {
        const el = this.elements.get(id)
        return el ? elementCorners(el).map((p) => worldToScreen(this.camera, p)) : null
      },
    }
    ;(window as unknown as { __PANO__?: typeof handle }).__PANO__ = handle
    this.cleanups.push(() => {
      const w = window as unknown as { __PANO__?: typeof handle }
      if (w.__PANO__ === handle) delete w.__PANO__
    })
  }

  destroy() {
    this.destroyed = true
    this.editor?.commit()
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.autoFitTimer) clearTimeout(this.autoFitTimer)
    if (this.autoFitStop) clearTimeout(this.autoFitStop)
    if (this.viewportTimer) clearTimeout(this.viewportTimer)
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.cursors.destroy()
  }
}
