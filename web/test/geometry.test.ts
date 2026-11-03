import { describe, expect, it } from 'vitest'
import { lineElement, shapeElement, stickyElement } from '../src/lib/builders'
import {
  boxCenter,
  elementBounds,
  elementCorners,
  elementsInBox,
  fitBounds,
  frameOf,
  handleCursor,
  hitTest,
  hitTestTopmost,
  localPoints,
  localToWorld,
  resizeFrame,
  rotatePoint,
  scaleFrameBetween,
  screenToWorld,
  snapAngle,
  worldToLocal,
  worldToScreen,
  zoomAt,
} from '../src/lib/geometry'
import type { ElementData, ElementInput } from '../src/lib/types'

const make = (input: ElementInput, id = 'el'): ElementData => ({
  rotation: 0,
  z: 1,
  strokeStyle: 'solid',
  opacity: 1,
  version: 0,
  ...input,
  id,
})

const close = (actual: number, expected: number, digits = 6) => expect(actual).toBeCloseTo(expected, digits)

describe('rotation and coordinate transforms', () => {
  it('rotates a point around a centre', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2)
    close(p.x, 0)
    close(p.y, 10)
  })

  it('round-trips world ↔ local for rotated elements', () => {
    const el = make(shapeElement('rect', 100, 50, 200, 80, { rotation: 0.7 }))
    for (const local of [
      { x: 0, y: 0 },
      { x: 200, y: 80 },
      { x: 37, y: 12 },
    ]) {
      const back = worldToLocal(el, localToWorld(el, local))
      close(back.x, local.x)
      close(back.y, local.y)
    }
  })

  it('keeps the frame centre fixed when rotating', () => {
    const el = make(shapeElement('rect', 0, 0, 100, 50, { rotation: Math.PI / 4 }))
    const corners = elementCorners(el)
    const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4
    const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4
    close(cx, 50)
    close(cy, 25)
  })

  it('computes axis-aligned bounds of a rotated frame', () => {
    const el = make(shapeElement('rect', 0, 0, 100, 100, { rotation: Math.PI / 4, strokeWidth: 0 }))
    const b = elementBounds(el)
    close(b.w, Math.SQRT2 * 100, 4)
    close(b.h, Math.SQRT2 * 100, 4)
  })
})

describe('hit testing', () => {
  it('filled rectangles are hit inside, unfilled only near the outline', () => {
    const filled = make(shapeElement('rect', 0, 0, 100, 100, { fill: '#ffe3e3' }))
    const empty = make(shapeElement('rect', 0, 0, 100, 100))
    expect(hitTest(filled, { x: 50, y: 50 }, 4)).toBe(true)
    expect(hitTest(empty, { x: 50, y: 50 }, 4)).toBe(false)
    expect(hitTest(empty, { x: 2, y: 50 }, 4)).toBe(true)
    expect(hitTest(empty, { x: 120, y: 50 }, 4)).toBe(false)
  })

  it('respects rotation', () => {
    // A thin bar rotated by 90° becomes vertical.
    const bar = make(shapeElement('rect', 0, 45, 100, 10, { fill: '#000000', rotation: Math.PI / 2 }))
    expect(hitTest(bar, { x: 50, y: 5 }, 0)).toBe(true)
    expect(hitTest(bar, { x: 5, y: 50 }, 0)).toBe(false)
  })

  it('tests ellipses by their equation', () => {
    const el = make(shapeElement('ellipse', 0, 0, 200, 100, { fill: '#d0ebff' }))
    expect(hitTest(el, { x: 100, y: 50 }, 0)).toBe(true)
    expect(hitTest(el, { x: 5, y: 5 }, 0)).toBe(false)
    const outline = make(shapeElement('ellipse', 0, 0, 200, 100))
    expect(hitTest(outline, { x: 100, y: 50 }, 2)).toBe(false)
    expect(hitTest(outline, { x: 200, y: 50 }, 2)).toBe(true)
  })

  it('tests diamonds and labelled shapes', () => {
    const el = make(shapeElement('diamond', 0, 0, 100, 100, { text: 'Karar' }))
    expect(hitTest(el, { x: 50, y: 50 }, 0)).toBe(true)
    expect(hitTest(el, { x: 5, y: 5 }, 0)).toBe(false)
  })

  it('tests lines by distance to the segment', () => {
    const el = make(lineElement('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { strokeWidth: 2 }))
    expect(hitTest(el, { x: 50, y: 52 }, 3)).toBe(true)
    expect(hitTest(el, { x: 50, y: 70 }, 3)).toBe(false)
  })

  it('picks the top-most element', () => {
    const bottom = make(stickyElement(0, 0, 'a', '#ffe066', 100), 'bottom')
    const top = make({ ...stickyElement(50, 50, 'b', '#ffe066', 100), z: 2 }, 'top')
    expect(hitTestTopmost([bottom, top], { x: 75, y: 75 }, 0)?.id).toBe('top')
    expect(hitTestTopmost([bottom, top], { x: 10, y: 10 }, 0)?.id).toBe('bottom')
    expect(hitTestTopmost([bottom, top], { x: 500, y: 500 }, 0)).toBeNull()
  })
})

describe('selection box', () => {
  const a = make(stickyElement(0, 0, 'a', '#ffe066', 100), 'a')
  const b = make(stickyElement(200, 0, 'b', '#ffe066', 100), 'b')
  const locked = make({ ...stickyElement(10, 10, 'c', '#ffe066', 50), locked: true }, 'locked')

  it('selects only fully contained, unlocked elements', () => {
    const ids = elementsInBox([a, b, locked], { x: -10, y: -10, w: 150, h: 150 }).map((el) => el.id)
    expect(ids).toEqual(['a'])
  })

  it('does not select partially covered elements', () => {
    expect(elementsInBox([a, b], { x: 50, y: 0, w: 200, h: 100 })).toHaveLength(0)
  })
})

describe('resize and scale transforms', () => {
  it('keeps the opposite corner fixed for unrotated frames', () => {
    const next = resizeFrame({ x: 0, y: 0, w: 100, h: 50 }, 0, 'se', { x: 150, y: 80 }, false)
    expect(next).toEqual({ x: 0, y: 0, w: 150, h: 80 })
  })

  it('keeps the anchor fixed in world space for rotated frames', () => {
    const frame = { x: 0, y: 0, w: 100, h: 50 }
    const rotation = 0.6
    const el = make(shapeElement('rect', frame.x, frame.y, frame.w, frame.h, { rotation }))
    const anchorBefore = elementCorners(el)[0] // nw stays fixed when dragging se
    const next = resizeFrame(frame, rotation, 'se', { x: 160, y: 140 }, false)
    const resized = make(shapeElement('rect', next.x, next.y, next.w, next.h, { rotation }))
    const anchorAfter = elementCorners(resized)[0]
    close(anchorAfter.x, anchorBefore.x)
    close(anchorAfter.y, anchorBefore.y)
  })

  it('preserves the aspect ratio when asked', () => {
    const next = resizeFrame({ x: 0, y: 0, w: 200, h: 100 }, 0, 'se', { x: 400, y: 120 }, true)
    close(next.w / next.h, 2)
  })

  it('clamps to a minimum size instead of flipping', () => {
    const next = resizeFrame({ x: 0, y: 0, w: 100, h: 100 }, 0, 'e', { x: -50, y: 50 }, false, 4)
    expect(next.w).toBe(4)
    expect(next.x).toBe(0)
  })

  it('scales frames proportionally between group boxes', () => {
    const next = scaleFrameBetween({ x: 10, y: 10, w: 20, h: 20 }, { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 50 })
    expect(next).toEqual({ x: 20, y: 5, w: 40, h: 10 })
  })

  it('stretches point elements with their frame', () => {
    const el = make(lineElement('line', { x: 0, y: 0 }, { x: 100, y: 50 }))
    const stretched = { ...el, w: 200, h: 100 }
    const pts = localPoints(stretched)
    expect(pts[1]).toEqual({ x: 200, y: 100 })
  })

  it('snaps angles to 15° steps', () => {
    close(snapAngle((44 * Math.PI) / 180), Math.PI / 4)
  })

  it('maps handle cursors through the rotation', () => {
    expect(handleCursor('e', 0)).toBe('ew-resize')
    expect(handleCursor('e', Math.PI / 2)).toBe('ns-resize')
  })
})

describe('camera', () => {
  it('converts between screen and world', () => {
    const cam = { x: 100, y: 50, zoom: 2 }
    const world = screenToWorld(cam, { x: 40, y: 20 })
    expect(world).toEqual({ x: 120, y: 60 })
    expect(worldToScreen(cam, world)).toEqual({ x: 40, y: 20 })
  })

  it('zooms around the pointer', () => {
    const cam = { x: 0, y: 0, zoom: 1 }
    const pointer = { x: 300, y: 200 }
    const before = screenToWorld(cam, pointer)
    const next = zoomAt(cam, pointer, 2.5)
    const after = screenToWorld(next, pointer)
    close(after.x, before.x)
    close(after.y, before.y)
    expect(next.zoom).toBe(2.5)
  })

  it('fits bounds into the viewport centred', () => {
    const cam = fitBounds({ x: 0, y: 0, w: 1000, h: 500 }, { w: 1200, h: 800 }, 100, 4)
    close(cam.zoom, 1)
    const centre = screenToWorld(cam, { x: 600, y: 400 })
    close(centre.x, 500)
    close(centre.y, 250)
    expect(boxCenter(frameOf(make(shapeElement('rect', 0, 0, 10, 10))))).toEqual({ x: 5, y: 5 })
  })
})
