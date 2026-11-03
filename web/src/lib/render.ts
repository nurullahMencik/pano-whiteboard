import { THEME, contrastText, resolveColor, type ThemeName } from './colors'
import { boxCenter, frameOf, localPoints, pointsBounds } from './geometry'
import { freedrawPath } from './stroke'
import { FONT_FAMILY, layoutElementText } from './text'
import type { ElementData, Vec } from './types'

export interface RenderOptions {
  theme: ThemeName
  /** Current zoom, used for zoom-independent effects such as shadows. */
  zoom: number
  getImage: (assetId: string) => CanvasImageSource | null
  /** Element whose text is being edited in the DOM overlay (skip its text). */
  editingId?: string | null
  /** Elements marked by the eraser are drawn faded. */
  fadedIds?: ReadonlySet<string>
}

const pathCache = new Map<string, { key: string; path: Path2D }>()

/** Shape labels stay readable: dark on pastel fills, theme ink on transparent shapes. */
export const labelColor = (el: ElementData, theme: ThemeName) =>
  el.fill !== 'none' ? contrastText(resolveColor(el.fill, theme)) : THEME[theme].ink

export const freedrawSize = (strokeWidth: number) => strokeWidth * 1.75

const freedrawPath2D = (el: ElementData): Path2D => {
  const frame = frameOf(el)
  const key = `${el.version}|${frame.w}|${frame.h}|${el.points?.length ?? 0}|${el.strokeWidth}`
  const cached = pathCache.get(el.id)
  if (cached && cached.key === key) return cached.path
  const flat = el.points ?? []
  let d: string
  if (el.draft) {
    const b = pointsBounds(flat, 3)
    d = freedrawPath(flat, freedrawSize(el.strokeWidth), 1, 1, -b.x, -b.y)
  } else {
    const sx = el.pw && el.pw > 0 ? el.w / el.pw : 1
    const sy = el.ph && el.ph > 0 ? el.h / el.ph : 1
    d = freedrawPath(flat, freedrawSize(el.strokeWidth), sx, sy)
  }
  const path = new Path2D(d)
  pathCache.set(el.id, { key, path })
  if (pathCache.size > 20_000) pathCache.clear()
  return path
}

export const arrowHeadPoints = (tip: Vec, from: Vec, strokeWidth: number): [Vec, Vec] => {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
  const length = Math.max(12, strokeWidth * 4.5)
  const spread = Math.PI / 7
  return [
    { x: tip.x - length * Math.cos(angle - spread), y: tip.y - length * Math.sin(angle - spread) },
    { x: tip.x - length * Math.cos(angle + spread), y: tip.y - length * Math.sin(angle + spread) },
  ]
}

const roundRectPath = (ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) => {
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, Math.max(0, Math.min(radius, w / 2, h / 2)))
}

export const shapeRadius = (el: ElementData) => (el.type === 'sticky' ? 6 : Math.min(14, el.w / 6, el.h / 6))

const applyStroke = (ctx: CanvasRenderingContext2D, el: ElementData, theme: ThemeName) => {
  ctx.strokeStyle = resolveColor(el.stroke, theme)
  ctx.lineWidth = el.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(el.strokeStyle === 'dashed' ? [el.strokeWidth * 3, el.strokeWidth * 2.5] : [])
}

const drawText = (ctx: CanvasRenderingContext2D, el: ElementData, color: string) => {
  const layout = layoutElementText(el)
  if (!layout) return
  ctx.fillStyle = color
  ctx.font = `500 ${layout.fontSize}px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = layout.align === 'center' ? 'center' : 'left'
  const x = layout.align === 'center' ? layout.x + layout.maxWidth / 2 : layout.x
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, x, layout.y + layout.lineHeight * (i + 0.5))
  })
}

/** Draws one element in world space (the caller sets up the camera transform). */
export const drawElement = (ctx: CanvasRenderingContext2D, el: ElementData, options: RenderOptions) => {
  const { theme } = options
  const frame = frameOf(el)
  const c = boxCenter(frame)
  ctx.save()
  ctx.globalAlpha = el.opacity * (options.fadedIds?.has(el.id) ? 0.25 : 1)
  ctx.translate(c.x, c.y)
  if (el.rotation) ctx.rotate(el.rotation)
  ctx.translate(-frame.w / 2, -frame.h / 2)
  const { w, h } = frame
  const showText = options.editingId !== el.id
  const ink = resolveColor(el.stroke, theme)

  switch (el.type) {
    case 'rect':
    case 'ellipse':
    case 'diamond': {
      ctx.beginPath()
      if (el.type === 'rect') roundRectPath(ctx, w, h, shapeRadius(el))
      else if (el.type === 'ellipse') ctx.ellipse(w / 2, h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2)
      else {
        ctx.moveTo(w / 2, 0)
        ctx.lineTo(w, h / 2)
        ctx.lineTo(w / 2, h)
        ctx.lineTo(0, h / 2)
        ctx.closePath()
      }
      if (el.fill !== 'none') {
        ctx.fillStyle = resolveColor(el.fill, theme)
        ctx.fill()
      }
      if (el.strokeWidth > 0 && el.stroke !== 'none') {
        applyStroke(ctx, el, theme)
        ctx.stroke()
      }
      if (showText) drawText(ctx, el, labelColor(el, theme))
      break
    }
    case 'line':
    case 'arrow': {
      const pts = localPoints(el)
      if (pts.length < 2) break
      applyStroke(ctx, el, theme)
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
      ctx.setLineDash([])
      const heads: [Vec, Vec][] = []
      if (el.type === 'arrow' && el.arrowEnd !== false) heads.push([pts[pts.length - 1], pts[pts.length - 2]])
      if (el.arrowStart) heads.push([pts[0], pts[1]])
      for (const [tip, from] of heads) {
        const [a, b] = arrowHeadPoints(tip, from, el.strokeWidth)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(tip.x, tip.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      break
    }
    case 'freedraw': {
      ctx.fillStyle = ink
      ctx.fill(freedrawPath2D(el))
      break
    }
    case 'text': {
      if (showText) drawText(ctx, el, ink)
      break
    }
    case 'sticky': {
      const color = el.fill === 'none' ? '#ffe066' : el.fill
      ctx.save()
      ctx.shadowColor = THEME[theme].stickyShadow
      ctx.shadowBlur = 14 * options.zoom
      ctx.shadowOffsetY = 4 * options.zoom
      roundRectPath(ctx, w, h, shapeRadius(el))
      ctx.fillStyle = color
      ctx.fill()
      ctx.restore()
      // Subtle folded corner.
      const fold = Math.min(22, w / 6, h / 6)
      ctx.beginPath()
      ctx.moveTo(w - fold, h)
      ctx.lineTo(w, h - fold)
      ctx.lineTo(w, h - shapeRadius(el))
      ctx.quadraticCurveTo(w, h, w - shapeRadius(el), h)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      ctx.fill()
      if (showText) drawText(ctx, el, THEME[theme].stickyText)
      break
    }
    case 'image': {
      const img = el.asset ? options.getImage(el.asset) : null
      if (img) {
        ctx.save()
        roundRectPath(ctx, w, h, 6)
        ctx.clip()
        ctx.drawImage(img, 0, 0, w, h)
        ctx.restore()
      } else {
        roundRectPath(ctx, w, h, 6)
        ctx.fillStyle = theme === 'dark' ? '#262a35' : '#e9e8e3'
        ctx.fill()
      }
      break
    }
  }
  ctx.restore()
}
