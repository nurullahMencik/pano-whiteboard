import { INK, NONE } from './colors'
import { pointsBounds } from './geometry'
import { round, type StrokePoint, toFlat } from './stroke'
import { DEFAULT_FONT_SIZE, STICKY_FONT_SIZE, type Measure, measureText, textBlockSize } from './text'
import type { ElementData, ElementInput, Vec } from './types'

export interface StyleInput {
  stroke?: string
  fill?: string
  strokeWidth?: number
  strokeStyle?: ElementData['strokeStyle']
  opacity?: number
  rotation?: number
  locked?: boolean
}

const base = (style: StyleInput) => ({
  stroke: style.stroke ?? INK,
  fill: style.fill ?? NONE,
  strokeWidth: style.strokeWidth ?? 2,
  strokeStyle: style.strokeStyle ?? 'solid',
  opacity: style.opacity ?? 1,
  rotation: style.rotation ?? 0,
  ...(style.locked ? { locked: true } : {}),
})

export const shapeElement = (
  type: 'rect' | 'ellipse' | 'diamond',
  x: number,
  y: number,
  w: number,
  h: number,
  style: StyleInput & { text?: string; fontSize?: number } = {},
): ElementInput => ({
  type,
  x,
  y,
  w,
  h,
  ...base(style),
  ...(style.text !== undefined ? { text: style.text, fontSize: style.fontSize ?? DEFAULT_FONT_SIZE, align: 'center' as const } : {}),
})

export const stickyElement = (
  x: number,
  y: number,
  text: string,
  color: string,
  size = 200,
  style: StyleInput & { fontSize?: number } = {},
): ElementInput => ({
  type: 'sticky',
  x,
  y,
  w: size,
  h: size,
  ...base({ strokeWidth: 0, ...style }),
  fill: color,
  text,
  fontSize: style.fontSize ?? STICKY_FONT_SIZE,
  align: 'center',
})

export const textElement = (
  x: number,
  y: number,
  text: string,
  fontSize = DEFAULT_FONT_SIZE,
  style: StyleInput = {},
  measure: Measure = measureText,
): ElementInput => {
  const size = textBlockSize(text, fontSize, measure)
  return { type: 'text', x, y, w: size.w, h: size.h, ...base(style), text, fontSize, align: 'left' }
}

/** Line/arrow from two world points; the frame is their bounding box. */
export const lineElement = (
  type: 'line' | 'arrow',
  start: Vec,
  end: Vec,
  style: StyleInput & { arrowStart?: boolean } = {},
): ElementInput => {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const w = Math.abs(end.x - start.x)
  const h = Math.abs(end.y - start.y)
  return {
    type,
    x,
    y,
    w,
    h,
    pw: w,
    ph: h,
    points: [start.x - x, start.y - y, end.x - x, end.y - y].map((v) => round(v)),
    ...base(style),
    ...(type === 'arrow' ? { arrowEnd: true } : {}),
    ...(style.arrowStart ? { arrowStart: true } : {}),
  }
}

/** Freehand stroke from world-space samples. */
export const freedrawElement = (samples: StrokePoint[], style: StyleInput = {}): ElementInput => {
  const flat = toFlat(samples)
  return { type: 'freedraw', ...normalizeFreedraw(0, 0, flat), ...base(style) }
}

/**
 * Turns draft points (relative to an origin) into the normalised form: frame =
 * bounding box, points relative to the frame's top-left, (pw, ph) = frame size.
 */
export const normalizeFreedraw = (originX: number, originY: number, flat: number[]) => {
  const b = pointsBounds(flat, 3)
  const points: number[] = []
  for (let i = 0; i + 2 < flat.length; i += 3) {
    points.push(round(flat[i] - b.x), round(flat[i + 1] - b.y), flat[i + 2])
  }
  return {
    x: originX + b.x,
    y: originY + b.y,
    w: b.w,
    h: b.h,
    pw: b.w,
    ph: b.h,
    points,
  }
}

/** Deterministic PRNG so seeded boards look identical for everyone. */
export const seededRandom = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const withPressure = (points: Vec[], random: () => number): StrokePoint[] =>
  points.map((p, i) => {
    const t = i / Math.max(1, points.length - 1)
    return { x: p.x, y: p.y, p: 0.55 + 0.35 * Math.sin(t * Math.PI) + (random() - 0.5) * 0.08 }
  })

/** Hand-drawn looking loop around a centre point. */
export const sketchCircle = (cx: number, cy: number, rx: number, ry: number, seed = 1): StrokePoint[] => {
  const random = seededRandom(seed)
  const points: Vec[] = []
  const steps = 64
  const start = -0.6
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * Math.PI * 2.15
    const wobble = 1 + (random() - 0.5) * 0.03 + (i / steps) * 0.06
    points.push({ x: cx + Math.cos(t) * rx * wobble, y: cy + Math.sin(t) * ry * wobble })
  }
  return withPressure(points, random)
}

export const sketchUnderline = (x: number, y: number, w: number, seed = 2): StrokePoint[] => {
  const random = seededRandom(seed)
  const points: Vec[] = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    points.push({ x: x + t * w, y: y + Math.sin(t * Math.PI * 3) * 3 + (random() - 0.5) * 1.5 - t * 6 })
  }
  return withPressure(points, random)
}

export const sketchStar = (cx: number, cy: number, r: number, seed = 3): StrokePoint[] => {
  const random = seededRandom(seed)
  const corners: Vec[] = []
  for (let i = 0; i <= 5; i++) {
    const angle = -Math.PI / 2 + (i * 4 * Math.PI) / 5
    corners.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r })
  }
  const points: Vec[] = []
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]
    const b = corners[i]
    for (let s = 0; s < 10; s++) {
      const t = s / 10
      points.push({ x: a.x + (b.x - a.x) * t + (random() - 0.5) * 1.6, y: a.y + (b.y - a.y) * t + (random() - 0.5) * 1.6 })
    }
  }
  points.push(corners[corners.length - 1])
  return withPressure(points, random)
}

export const sketchCheck = (x: number, y: number, size: number, seed = 4): StrokePoint[] => {
  const random = seededRandom(seed)
  const points: Vec[] = []
  for (let i = 0; i <= 8; i++) points.push({ x: x + (i / 8) * size * 0.35, y: y + (i / 8) * size * 0.4 })
  for (let i = 1; i <= 16; i++) points.push({ x: x + size * 0.35 + (i / 16) * size * 0.65, y: y + size * 0.4 - (i / 16) * size * 0.85 })
  return withPressure(points, random)
}

export const sketchWave = (x: number, y: number, w: number, amplitude: number, seed = 5): StrokePoint[] => {
  const random = seededRandom(seed)
  const points: Vec[] = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    points.push({ x: x + t * w, y: y + Math.sin(t * Math.PI * 4) * amplitude * (0.6 + t * 0.4) })
  }
  return withPressure(points, random)
}
