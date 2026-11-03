import { clamp } from './geometry'

/** A captured stroke sample: position plus pressure in [0, 1]. */
export interface StrokePoint {
  x: number
  y: number
  p: number
}

export const toStrokePoints = (flat: number[]): StrokePoint[] => {
  const out: StrokePoint[] = []
  for (let i = 0; i + 1 < flat.length; i += 3) {
    out.push({ x: flat[i], y: flat[i + 1], p: i + 2 < flat.length ? flat[i + 2] : 0.5 })
  }
  return out
}

export const toFlat = (points: StrokePoint[]): number[] => {
  const out: number[] = []
  for (const pt of points) out.push(round(pt.x), round(pt.y), round(pt.p, 100))
  return out
}

/** Rounds to a grid that Yjs can store as float32/int (compact updates). */
export const round = (value: number, precision = 4) => Math.round(value * precision) / precision

/**
 * Input stabiliser ("streamline"): each new sample moves only part of the way
 * towards the pointer, which removes hand jitter while drawing.
 */
export const streamline = (prev: StrokePoint, input: StrokePoint, amount = 0.45): StrokePoint => ({
  x: prev.x + (input.x - prev.x) * (1 - amount),
  y: prev.y + (input.y - prev.y) * (1 - amount),
  p: input.p,
})

/**
 * Pressure for mice/touch: fast movement produces a thinner line, slow
 * movement a thicker one, smoothed so the width never jumps.
 */
export const simulatedPressure = (prev: number, distanceMoved: number, size: number): number => {
  const speed = Math.min(1, distanceMoved / Math.max(1, size * 3))
  const target = 1 - speed
  return clamp(prev + (target - prev) * 0.3, 0.15, 1)
}

/**
 * Laplacian smoothing (weights 1/4, 1/2, 1/4) with fixed end points. A few
 * iterations turn a jittery polyline into a calm curve without shrinking it
 * noticeably.
 */
export const smoothPoints = (points: StrokePoint[], iterations = 2): StrokePoint[] => {
  if (points.length < 3) return points.map((p) => ({ ...p }))
  let current = points.map((p) => ({ ...p }))
  for (let it = 0; it < iterations; it++) {
    const next = current.map((p) => ({ ...p }))
    for (let i = 1; i < current.length - 1; i++) {
      const a = current[i - 1]
      const b = current[i]
      const c = current[i + 1]
      next[i] = {
        x: a.x * 0.25 + b.x * 0.5 + c.x * 0.25,
        y: a.y * 0.25 + b.y * 0.5 + c.y * 0.25,
        p: a.p * 0.25 + b.p * 0.5 + c.p * 0.25,
      }
    }
    current = next
  }
  return current
}

const perpendicularDistance = (p: StrokePoint, a: StrokePoint, b: StrokePoint) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

/** Ramer–Douglas–Peucker simplification (iterative, keeps first and last point). */
export const simplifyPoints = (points: StrokePoint[], tolerance: number): StrokePoint[] => {
  if (points.length <= 2) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const range = stack.pop()
    if (!range) break
    const [start, end] = range
    let maxDistance = 0
    let index = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end])
      if (d > maxDistance) {
        maxDistance = d
        index = i
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = 1
      stack.push([start, index], [index, end])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

/**
 * Builds the filled outline of a variable-width stroke. The radius follows
 * pressure and tapers slightly at both ends; caps are round. Returns the
 * outline polygon (world/local units, not closed explicitly).
 */
export const strokeOutline = (input: StrokePoint[], size: number, thinning = 0.55): { x: number; y: number }[] => {
  const points = input.length > 2 ? smoothPoints(input, 2) : input
  const radiusAt = (i: number) => {
    const pressure = clamp(points[i].p, 0, 1)
    let r = (size / 2) * (1 - thinning * (1 - pressure))
    // Gentle taper over the first/last few samples.
    const taper = Math.min(4, Math.floor(points.length / 4))
    if (taper > 0) {
      if (i < taper) r *= 0.55 + (0.45 * i) / taper
      const fromEnd = points.length - 1 - i
      if (fromEnd < taper) r *= 0.6 + (0.4 * fromEnd) / taper
    }
    return Math.max(r, size * 0.12)
  }

  if (points.length === 0) return []
  if (points.length === 1 || points.every((p) => p.x === points[0].x && p.y === points[0].y)) {
    const r = Math.max(size / 2, 0.5)
    const circle: { x: number; y: number }[] = []
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2
      circle.push({ x: points[0].x + Math.cos(t) * r, y: points[0].y + Math.sin(t) * r })
    }
    return circle
  }

  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const r = radiusAt(i)
    left.push({ x: points[i].x - ty * r, y: points[i].y + tx * r })
    right.push({ x: points[i].x + ty * r, y: points[i].y - tx * r })
  }

  const cap = (center: StrokePoint, from: { x: number; y: number }, r: number, steps = 6) => {
    const start = Math.atan2(from.y - center.y, from.x - center.x)
    const out: { x: number; y: number }[] = []
    for (let s = 1; s < steps; s++) {
      const t = start + (Math.PI * s) / steps
      out.push({ x: center.x + Math.cos(t) * r, y: center.y + Math.sin(t) * r })
    }
    return out
  }

  const last = points.length - 1
  const endCap = cap(points[last], left[last], radiusAt(last))
  const startCap = cap(points[0], right[0], radiusAt(0))
  return [...left, ...endCap, ...right.reverse(), ...startCap]
}

/** Smooth closed SVG path through the outline (quadratic curves via midpoints). */
export const outlineToPath = (outline: { x: number; y: number }[]): string => {
  if (outline.length < 3) return ''
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const start = mid(outline[outline.length - 1], outline[0])
  let d = `M${fmt(start.x)} ${fmt(start.y)}`
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]
    const m = mid(p, outline[(i + 1) % outline.length])
    d += `Q${fmt(p.x)} ${fmt(p.y)} ${fmt(m.x)} ${fmt(m.y)}`
  }
  return d + 'Z'
}

/** Convenience: flat freedraw points → SVG path (used by canvas Path2D and SVG export). */
export const freedrawPath = (flat: number[], size: number, scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0) => {
  const points = toStrokePoints(flat).map((p) => ({ x: p.x * scaleX + offsetX, y: p.y * scaleY + offsetY, p: p.p }))
  return outlineToPath(strokeOutline(points, size))
}
