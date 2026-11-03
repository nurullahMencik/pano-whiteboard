import { describe, expect, it } from 'vitest'
import { seededRandom } from '../src/lib/builders'
import {
  outlineToPath,
  simplifyPoints,
  simulatedPressure,
  smoothPoints,
  streamline,
  strokeOutline,
  type StrokePoint,
  toFlat,
  toStrokePoints,
} from '../src/lib/stroke'

/** Sum of squared second differences: a standard roughness measure. */
const roughness = (points: StrokePoint[]) => {
  let sum = 0
  for (let i = 1; i < points.length - 1; i++) {
    const ax = points[i - 1].x - 2 * points[i].x + points[i + 1].x
    const ay = points[i - 1].y - 2 * points[i].y + points[i + 1].y
    sum += ax * ax + ay * ay
  }
  return sum
}

const jitteryLine = (): StrokePoint[] => {
  const random = seededRandom(7)
  return Array.from({ length: 60 }, (_, i) => ({ x: i * 5, y: (random() - 0.5) * 6, p: 0.5 }))
}

describe('stroke smoothing', () => {
  it('reduces jitter substantially', () => {
    const raw = jitteryLine()
    const smooth = smoothPoints(raw, 2)
    expect(roughness(smooth)).toBeLessThan(roughness(raw) * 0.2)
  })

  it('keeps the end points and the sample count', () => {
    const raw = jitteryLine()
    const smooth = smoothPoints(raw, 3)
    expect(smooth).toHaveLength(raw.length)
    expect(smooth[0]).toEqual(raw[0])
    expect(smooth[smooth.length - 1]).toEqual(raw[raw.length - 1])
  })

  it('leaves straight lines straight', () => {
    const line = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i * 2, p: 1 }))
    for (const p of smoothPoints(line, 4)) expect(p.y).toBeCloseTo(p.x * 2, 9)
  })

  it('streamline moves only part of the way to the pointer', () => {
    const next = streamline({ x: 0, y: 0, p: 0.5 }, { x: 10, y: 0, p: 0.8 }, 0.5)
    expect(next).toEqual({ x: 5, y: 0, p: 0.8 })
  })

  it('simulated pressure thins fast strokes and stays in range', () => {
    let slow = 0.5
    let fast = 0.5
    for (let i = 0; i < 20; i++) {
      slow = simulatedPressure(slow, 0.5, 4)
      fast = simulatedPressure(fast, 40, 4)
    }
    expect(slow).toBeGreaterThan(fast)
    expect(fast).toBeGreaterThanOrEqual(0.15)
    expect(slow).toBeLessThanOrEqual(1)
  })

  it('simplifies collinear samples down to the end points', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i, p: 0.5 }))
    expect(simplifyPoints(line, 0.5)).toHaveLength(2)
    const corner = [...line, ...Array.from({ length: 50 }, (_, i) => ({ x: 49 + i, y: 49 - i, p: 0.5 }))]
    expect(simplifyPoints(corner, 0.5).length).toBe(3)
  })

  it('round-trips the flat storage format', () => {
    const pts = [
      { x: 1.25, y: 2.5, p: 0.5 },
      { x: 3.75, y: 4, p: 1 },
    ]
    expect(toStrokePoints(toFlat(pts))).toEqual(pts)
  })
})

describe('stroke outline', () => {
  it('builds a closed outline that stays within the stroke radius', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ x: i * 4, y: Math.sin(i / 4) * 20, p: 0.7 }))
    const size = 8
    const outline = strokeOutline(points, size)
    expect(outline.length).toBeGreaterThan(points.length * 2)
    const smooth = smoothPoints(points, 2)
    for (const o of outline) {
      const nearest = Math.min(...smooth.map((p) => Math.hypot(p.x - o.x, p.y - o.y)))
      expect(nearest).toBeLessThanOrEqual(size / 2 + 1e-6)
    }
    expect(outlineToPath(outline)).toMatch(/^M.*Z$/)
  })

  it('makes high-pressure strokes wider than low-pressure ones', () => {
    const line = (p: number) => Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0, p }))
    const width = (o: { y: number }[]) => Math.max(...o.map((q) => q.y)) - Math.min(...o.map((q) => q.y))
    expect(width(strokeOutline(line(1), 10))).toBeGreaterThan(width(strokeOutline(line(0.1), 10)))
  })

  it('renders a dot for a single sample', () => {
    const outline = strokeOutline([{ x: 5, y: 5, p: 0.5 }], 6)
    expect(outline).toHaveLength(16)
    for (const p of outline) expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(3, 6)
  })
})
