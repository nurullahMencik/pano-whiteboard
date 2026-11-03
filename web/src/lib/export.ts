import { THEME, resolveColor, type ThemeName } from './colors'
import { boxCenter, commonBounds, frameOf, localPoints, pointsBounds } from './geometry'
import { arrowHeadPoints, drawElement, freedrawSize, shapeRadius } from './render'
import { freedrawPath } from './stroke'
import { FONT_FAMILY, layoutElementText, type Measure, measureText } from './text'
import type { Box, ElementData } from './types'

export interface ExportOptions {
  theme: ThemeName
  /** Solid background in the theme's canvas colour; false = transparent. */
  background: boolean
  padding?: number
  assets: (id: string) => string | undefined
  measure?: Measure
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const n = (value: number) => (Math.round(value * 100) / 100).toString()

const textSvg = (el: ElementData, color: string, measure: Measure): string => {
  const layout = layoutElementText(el, measure)
  if (!layout) return ''
  const anchor = layout.align === 'center' ? 'middle' : 'start'
  const x = layout.align === 'center' ? layout.x + layout.maxWidth / 2 : layout.x
  const spans = layout.lines
    .map(
      (line, i) =>
        `<tspan x="${n(x)}" y="${n(layout.y + layout.lineHeight * (i + 0.5))}">${escapeXml(line === '' ? ' ' : line)}</tspan>`,
    )
    .join('')
  return `<text font-family='${FONT_FAMILY.replace(/"/g, '')}' font-size="${n(layout.fontSize)}" font-weight="500" fill="${color}" text-anchor="${anchor}" dominant-baseline="central" xml:space="preserve">${spans}</text>`
}

const strokeAttrs = (el: ElementData, theme: ThemeName) => {
  const dash = el.strokeStyle === 'dashed' ? ` stroke-dasharray="${n(el.strokeWidth * 3)} ${n(el.strokeWidth * 2.5)}"` : ''
  return `stroke="${resolveColor(el.stroke, theme)}" stroke-width="${n(el.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dash}`
}

/** Serialises one element as an SVG group in world coordinates. */
export const elementToSvg = (el: ElementData, options: ExportOptions): string => {
  const { theme } = options
  const measure = options.measure ?? measureText
  const frame = frameOf(el)
  const c = boxCenter(frame)
  const { w, h } = frame
  const ink = resolveColor(el.stroke, theme)
  const deg = (el.rotation * 180) / Math.PI
  const transform = `translate(${n(frame.x)} ${n(frame.y)})${deg ? ` rotate(${n(deg)} ${n(c.x - frame.x)} ${n(c.y - frame.y)})` : ''}`
  const opacity = el.opacity < 1 ? ` opacity="${n(el.opacity)}"` : ''
  let body = ''
  switch (el.type) {
    case 'rect': {
      const fill = el.fill === 'none' ? 'none' : resolveColor(el.fill, theme)
      body = `<rect width="${n(w)}" height="${n(h)}" rx="${n(shapeRadius(el))}" fill="${fill}" ${strokeAttrs(el, theme)}/>` + textSvg(el, ink, measure)
      break
    }
    case 'ellipse': {
      const fill = el.fill === 'none' ? 'none' : resolveColor(el.fill, theme)
      body = `<ellipse cx="${n(w / 2)}" cy="${n(h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${fill}" ${strokeAttrs(el, theme)}/>` + textSvg(el, ink, measure)
      break
    }
    case 'diamond': {
      const fill = el.fill === 'none' ? 'none' : resolveColor(el.fill, theme)
      body = `<path d="M${n(w / 2)} 0L${n(w)} ${n(h / 2)}L${n(w / 2)} ${n(h)}L0 ${n(h / 2)}Z" fill="${fill}" ${strokeAttrs(el, theme)}/>` + textSvg(el, ink, measure)
      break
    }
    case 'line':
    case 'arrow': {
      const pts = localPoints(el)
      if (pts.length < 2) break
      body = `<polyline points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" ${strokeAttrs(el, theme)}/>`
      const tips: [{ x: number; y: number }, { x: number; y: number }][] = []
      if (el.type === 'arrow' && el.arrowEnd !== false) tips.push([pts[pts.length - 1], pts[pts.length - 2]])
      if (el.arrowStart) tips.push([pts[0], pts[1]])
      for (const [tip, from] of tips) {
        const [a, b] = arrowHeadPoints(tip, from, el.strokeWidth)
        body += `<polyline points="${n(a.x)},${n(a.y)} ${n(tip.x)},${n(tip.y)} ${n(b.x)},${n(b.y)}" fill="none" stroke="${ink}" stroke-width="${n(el.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`
      }
      break
    }
    case 'freedraw': {
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
      body = `<path d="${d}" fill="${ink}"/>`
      break
    }
    case 'text':
      body = textSvg(el, ink, measure)
      break
    case 'sticky': {
      const fill = el.fill === 'none' ? '#ffe066' : el.fill
      body =
        `<rect x="0" y="3" width="${n(w)}" height="${n(h)}" rx="6" fill="#000" opacity="0.12"/>` +
        `<rect width="${n(w)}" height="${n(h)}" rx="6" fill="${fill}"/>` +
        textSvg(el, THEME[theme].stickyText, measure)
      break
    }
    case 'image': {
      const href = el.asset ? options.assets(el.asset) : undefined
      body = href
        ? `<image href="${escapeXml(href)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none"/>`
        : `<rect width="${n(w)}" height="${n(h)}" rx="6" fill="#e9e8e3"/>`
      break
    }
  }
  return `<g transform="${transform}"${opacity}>${body}</g>`
}

export const exportBounds = (elements: ElementData[], padding = 32): Box | null => {
  const bounds = commonBounds(elements)
  if (!bounds) return null
  return { x: bounds.x - padding, y: bounds.y - padding, w: bounds.w + padding * 2, h: bounds.h + padding * 2 }
}

/** Builds a standalone SVG document for the given elements (sorted bottom → top). */
export const boardToSvg = (elements: ElementData[], options: ExportOptions): { svg: string; width: number; height: number } => {
  const box = exportBounds(elements, options.padding ?? 32) ?? { x: 0, y: 0, w: 1, h: 1 }
  const background = options.background ? `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="${THEME[options.theme].canvas}"/>` : ''
  const content = elements.map((el) => elementToSvg(el, options)).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}" width="${Math.ceil(box.w)}" height="${Math.ceil(box.h)}">` +
    background +
    content +
    '</svg>'
  return { svg, width: Math.ceil(box.w), height: Math.ceil(box.h) }
}

/** Loads every image referenced by the elements so the canvas export can draw them. */
export const loadImages = async (elements: ElementData[], assets: (id: string) => string | undefined) => {
  const images = new Map<string, HTMLImageElement>()
  await Promise.all(
    elements
      .filter((el) => el.type === 'image' && el.asset)
      .map(async (el) => {
        const id = el.asset as string
        const src = assets(id)
        if (!src || images.has(id)) return
        const img = new Image()
        img.src = src
        try {
          await img.decode()
          images.set(id, img)
        } catch {
          // Broken asset: exported as a placeholder.
        }
      }),
  )
  return images
}

/** Renders the elements into a PNG blob. */
export const boardToPng = async (
  elements: ElementData[],
  options: ExportOptions & { scale?: number },
): Promise<{ blob: Blob; width: number; height: number }> => {
  const box = exportBounds(elements, options.padding ?? 32) ?? { x: 0, y: 0, w: 1, h: 1 }
  const maxSide = 8192
  const scale = Math.min(options.scale ?? 2, maxSide / box.w, maxSide / box.h)
  const width = Math.max(1, Math.round(box.w * scale))
  const height = Math.max(1, Math.round(box.h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  if (options.background) {
    ctx.fillStyle = THEME[options.theme].canvas
    ctx.fillRect(0, 0, width, height)
  }
  const images = await loadImages(elements, options.assets)
  ctx.scale(scale, scale)
  ctx.translate(-box.x, -box.y)
  for (const el of elements) {
    drawElement(ctx, el, { theme: options.theme, zoom: scale, getImage: (id) => images.get(id) ?? null })
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  )
  return { blob, width, height }
}

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
