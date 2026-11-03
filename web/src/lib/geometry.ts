import type { Box, Camera, ElementData, Handle, Vec } from './types'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const rotatePoint = (p: Vec, c: Vec, angle: number): Vec => {
  if (angle === 0) return { x: p.x, y: p.y }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

export const boxCenter = (b: Box): Vec => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

export const normalizeBox = (a: Vec, b: Vec): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
})

export const unionBoxes = (boxes: Box[]): Box | null => {
  if (boxes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export const boxesIntersect = (a: Box, b: Box) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y

export const boxContains = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

export const isPointElement = (el: Pick<ElementData, 'type'>) =>
  el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw'

export const pointStride = (el: Pick<ElementData, 'type'>) => (el.type === 'freedraw' ? 3 : 2)

/** Bounds of raw local points (used for drafts and normalisation). */
export const pointsBounds = (points: number[], stride: number): Box => {
  if (points.length < stride) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < points.length; i += stride) {
    const x = points[i]
    const y = points[i + 1]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The element frame. Draft freedraw strokes derive it from their points. */
export const frameOf = (el: ElementData): Box => {
  if (el.draft && el.points) {
    const b = pointsBounds(el.points, pointStride(el))
    return { x: el.x + b.x, y: el.y + b.y, w: b.w, h: b.h }
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h }
}

/** Points of a point-based element mapped into frame-local coordinates (0..w, 0..h). */
export const localPoints = (el: ElementData): Vec[] => {
  const points = el.points ?? []
  const stride = pointStride(el)
  const out: Vec[] = []
  if (el.draft) {
    const b = pointsBounds(points, stride)
    for (let i = 0; i + 1 < points.length; i += stride) out.push({ x: points[i] - b.x, y: points[i + 1] - b.y })
    return out
  }
  const sx = el.pw && el.pw > 0 ? el.w / el.pw : 1
  const sy = el.ph && el.ph > 0 ? el.h / el.ph : 1
  for (let i = 0; i + 1 < points.length; i += stride) out.push({ x: points[i] * sx, y: points[i + 1] * sy })
  return out
}

export const elementCenter = (el: ElementData): Vec => boxCenter(frameOf(el))

export const localToWorld = (el: ElementData, p: Vec): Vec => {
  const frame = frameOf(el)
  return rotatePoint({ x: frame.x + p.x, y: frame.y + p.y }, boxCenter(frame), el.rotation)
}

export const worldToLocal = (el: ElementData, p: Vec): Vec => {
  const frame = frameOf(el)
  const r = rotatePoint(p, boxCenter(frame), -el.rotation)
  return { x: r.x - frame.x, y: r.y - frame.y }
}

/** Rotated frame corners in world space: nw, ne, se, sw. */
export const elementCorners = (el: ElementData): Vec[] => {
  const f = frameOf(el)
  const c = boxCenter(f)
  return [
    { x: f.x, y: f.y },
    { x: f.x + f.w, y: f.y },
    { x: f.x + f.w, y: f.y + f.h },
    { x: f.x, y: f.y + f.h },
  ].map((p) => rotatePoint(p, c, el.rotation))
}

/** Axis aligned bounds in world space, including half the stroke width. */
export const elementBounds = (el: ElementData): Box => {
  const pad = el.type === 'freedraw' ? el.strokeWidth : el.strokeWidth / 2
  let box: Box
  if (isPointElement(el) && el.points && el.points.length >= 2) {
    const world = localPoints(el).map((p) => localToWorld(el, p))
    box = unionBoxes(world.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))) ?? frameOf(el)
  } else {
    const cs = elementCorners(el)
    box = unionBoxes(cs.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))) ?? frameOf(el)
  }
  const arrowPad = el.type === 'arrow' ? el.strokeWidth * 3 : 0
  const p = pad + arrowPad
  return { x: box.x - p, y: box.y - p, w: box.w + p * 2, h: box.h + p * 2 }
}

export const commonBounds = (els: ElementData[]): Box | null => unionBoxes(els.map(elementBounds))

/** Frame union without stroke padding (what selection handles wrap). */
export const selectionBounds = (els: ElementData[]): Box | null =>
  unionBoxes(
    els.map((el) => {
      const cs = elementCorners(el)
      return unionBoxes(cs.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))) ?? frameOf(el)
    }),
  )

export const distanceToSegment = (p: Vec, a: Vec, b: Vec): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return distance(p, a)
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export const distanceToPolyline = (p: Vec, points: Vec[]): number => {
  if (points.length === 0) return Infinity
  if (points.length === 1) return distance(p, points[0])
  let best = Infinity
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]))
  return best
}

const hasText = (el: ElementData) => Boolean(el.text && el.text.trim().length > 0)

/**
 * Hit test in world space. Filled shapes (and shapes with a label) are hit
 * anywhere inside; unfilled shapes only near their outline so that big empty
 * frames do not swallow clicks meant for the canvas.
 */
export const hitTest = (el: ElementData, world: Vec, tolerance: number): boolean => {
  const p = worldToLocal(el, world)
  const { w, h } = frameOf(el)
  const reach = tolerance + el.strokeWidth / 2
  const solid = el.fill !== 'none' || hasText(el)
  switch (el.type) {
    case 'text':
    case 'sticky':
    case 'image':
      return p.x >= -tolerance && p.y >= -tolerance && p.x <= w + tolerance && p.y <= h + tolerance
    case 'rect': {
      const inside = p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h
      if (solid && inside) return true
      const outline = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
        { x: 0, y: 0 },
      ]
      return distanceToPolyline(p, outline) <= reach
    }
    case 'diamond': {
      const cx = w / 2
      const cy = h / 2
      const norm = (w > 0 ? Math.abs(p.x - cx) / cx : 0) + (h > 0 ? Math.abs(p.y - cy) / cy : 0)
      if (solid && norm <= 1) return true
      const outline = [
        { x: cx, y: 0 },
        { x: w, y: cy },
        { x: cx, y: h },
        { x: 0, y: cy },
        { x: cx, y: 0 },
      ]
      return distanceToPolyline(p, outline) <= reach
    }
    case 'ellipse': {
      const rx = w / 2
      const ry = h / 2
      if (rx <= 0 || ry <= 0) return distanceToSegment(p, { x: 0, y: 0 }, { x: w, y: h }) <= reach
      const dx = (p.x - rx) / rx
      const dy = (p.y - ry) / ry
      const d = Math.sqrt(dx * dx + dy * dy)
      if (solid && d <= 1) return true
      return Math.abs(d - 1) * Math.min(rx, ry) <= reach
    }
    case 'line':
    case 'arrow':
      return distanceToPolyline(p, localPoints(el)) <= reach
    case 'freedraw':
      return distanceToPolyline(p, localPoints(el)) <= tolerance + el.strokeWidth * 0.75
  }
}

/** Top-most element under the point (elements must be sorted bottom → top). */
export const hitTestTopmost = (sorted: ElementData[], world: Vec, tolerance: number): ElementData | null => {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const el = sorted[i]
    if (hitTest(el, world, tolerance)) return el
  }
  return null
}

/** Marquee selection: an element is selected when its bounds are fully inside the box. */
export const elementsInBox = (els: ElementData[], box: Box): ElementData[] =>
  els.filter((el) => !el.locked && boxContains(box, elementBounds(el)))

/* ---------------------------------------------------------------- camera */

export const screenToWorld = (cam: Camera, p: Vec): Vec => ({ x: cam.x + p.x / cam.zoom, y: cam.y + p.y / cam.zoom })

export const worldToScreen = (cam: Camera, p: Vec): Vec => ({ x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom })

/** Zooms keeping the world point under `screenPoint` fixed. */
export const zoomAt = (cam: Camera, screenPoint: Vec, nextZoom: number): Camera => {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  const world = screenToWorld(cam, screenPoint)
  return { x: world.x - screenPoint.x / zoom, y: world.y - screenPoint.y / zoom, zoom }
}

export const visibleWorld = (cam: Camera, viewport: { w: number; h: number }): Box => ({
  x: cam.x,
  y: cam.y,
  w: viewport.w / cam.zoom,
  h: viewport.h / cam.zoom,
})

/** Camera that shows `bounds` centred in the viewport with some padding. */
export const fitBounds = (
  bounds: Box,
  viewport: { w: number; h: number },
  padding = 48,
  maxZoom = 1.5,
): Camera => {
  const availW = Math.max(1, viewport.w - padding * 2)
  const availH = Math.max(1, viewport.h - padding * 2)
  const zoom = clamp(Math.min(availW / Math.max(bounds.w, 1), availH / Math.max(bounds.h, 1)), MIN_ZOOM, maxZoom)
  const c = boxCenter(bounds)
  return { x: c.x - viewport.w / 2 / zoom, y: c.y - viewport.h / 2 / zoom, zoom }
}

/* ------------------------------------------------------------ transforms */

type ResizeHandle = Exclude<Handle, 'rotate' | 'start' | 'end'>

const HANDLE_DIRS: Record<ResizeHandle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
}

export const RESIZE_HANDLES = Object.keys(HANDLE_DIRS) as ResizeHandle[]

export const isResizeHandle = (h: Handle): h is ResizeHandle => h in HANDLE_DIRS

/**
 * Resizes a (possibly rotated) frame by dragging one of its handles. The
 * opposite edge/corner stays fixed in world space. Sizes are clamped to
 * `minSize`, so a handle cannot cross its anchor.
 */
export const resizeFrame = (
  frame: Box,
  rotation: number,
  handle: ResizeHandle,
  pointer: Vec,
  keepAspect: boolean,
  minSize = 4,
): Box => {
  const c = boxCenter(frame)
  const p = rotatePoint(pointer, c, -rotation)
  const [dx, dy] = HANDLE_DIRS[handle]
  let left = frame.x
  let right = frame.x + frame.w
  let top = frame.y
  let bottom = frame.y + frame.h

  if (dx === 1) right = Math.max(left + minSize, p.x)
  if (dx === -1) left = Math.min(right - minSize, p.x)
  if (dy === 1) bottom = Math.max(top + minSize, p.y)
  if (dy === -1) top = Math.min(bottom - minSize, p.y)

  if (keepAspect && frame.w > 0 && frame.h > 0) {
    const ratio = frame.w / frame.h
    let w = right - left
    let h = bottom - top
    if (dx !== 0 && dy !== 0) {
      if (w / frame.w > h / frame.h) h = w / ratio
      else w = h * ratio
      if (dx === 1) right = left + w
      else left = right - w
      if (dy === 1) bottom = top + h
      else top = bottom - h
    } else if (dx !== 0) {
      h = w / ratio
      top = c.y - h / 2
      bottom = c.y + h / 2
    } else {
      w = h * ratio
      left = c.x - w / 2
      right = c.x + w / 2
    }
  }

  const next: Box = { x: left, y: top, w: right - left, h: bottom - top }
  const nextCenter = rotatePoint(boxCenter(next), c, rotation)
  return { x: nextCenter.x - next.w / 2, y: nextCenter.y - next.h / 2, w: next.w, h: next.h }
}

/** Maps an element frame from `from` into `to` (used for multi-selection scaling). */
export const scaleFrameBetween = (frame: Box, from: Box, to: Box): Box => {
  const sx = from.w > 0 ? to.w / from.w : 1
  const sy = from.h > 0 ? to.h / from.h : 1
  const c = boxCenter(frame)
  const nc = { x: to.x + (c.x - from.x) * sx, y: to.y + (c.y - from.y) * sy }
  const w = frame.w * sx
  const h = frame.h * sy
  return { x: nc.x - w / 2, y: nc.y - h / 2, w, h }
}

export const snapAngle = (angle: number, step = Math.PI / 12) => Math.round(angle / step) * step

export const normalizeAngle = (angle: number) => {
  const full = Math.PI * 2
  return ((angle % full) + full) % full
}

/** Handle positions in world space for a single (rotated) element. */
export const handlePositions = (el: ElementData, zoom: number): Partial<Record<Handle, Vec>> => {
  if ((el.type === 'line' || el.type === 'arrow') && el.points && el.points.length >= 4) {
    const pts = localPoints(el)
    return { start: localToWorld(el, pts[0]), end: localToWorld(el, pts[pts.length - 1]) }
  }
  const f = frameOf(el)
  const c = boxCenter(f)
  const local: Record<ResizeHandle, Vec> = {
    nw: { x: f.x, y: f.y },
    n: { x: c.x, y: f.y },
    ne: { x: f.x + f.w, y: f.y },
    e: { x: f.x + f.w, y: c.y },
    se: { x: f.x + f.w, y: f.y + f.h },
    s: { x: c.x, y: f.y + f.h },
    sw: { x: f.x, y: f.y + f.h },
    w: { x: f.x, y: c.y },
  }
  const out: Partial<Record<Handle, Vec>> = {}
  const cornersOnly = el.type === 'text'
  for (const key of RESIZE_HANDLES) {
    if (cornersOnly && key.length === 1) continue
    out[key] = rotatePoint(local[key], c, el.rotation)
  }
  out.rotate = rotatePoint({ x: c.x, y: f.y - 28 / zoom }, c, el.rotation)
  return out
}

/** Handle positions for an axis-aligned group box. */
export const groupHandlePositions = (box: Box, zoom: number): Partial<Record<Handle, Vec>> => {
  const c = boxCenter(box)
  return {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    se: { x: box.x + box.w, y: box.y + box.h },
    sw: { x: box.x, y: box.y + box.h },
    n: { x: c.x, y: box.y },
    e: { x: box.x + box.w, y: c.y },
    s: { x: c.x, y: box.y + box.h },
    w: { x: box.x, y: c.y },
    rotate: { x: c.x, y: box.y - 28 / zoom },
  }
}

/** CSS cursor for a resize handle, taking the element rotation into account. */
export const handleCursor = (handle: Handle, rotation: number): string => {
  if (handle === 'rotate') return 'grab'
  if (handle === 'start' || handle === 'end') return 'move'
  const base: Record<ResizeHandle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }
  const deg = (((base[handle] + (rotation * 180) / Math.PI) % 180) + 180) % 180
  const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']
  return cursors[Math.round(deg / 45) % 4]
}
