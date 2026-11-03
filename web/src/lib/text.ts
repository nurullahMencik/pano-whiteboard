import type { ElementData } from './types'

export const FONT_FAMILY = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
export const LINE_HEIGHT = 1.3
export const STICKY_PADDING = 18
export const LABEL_PADDING = 12
export const DEFAULT_FONT_SIZE = 20
export const STICKY_FONT_SIZE = 22

export type Measure = (text: string, fontSize: number, weight?: number) => number

let measureContext: CanvasRenderingContext2D | null | undefined

/** Canvas based measurement in the browser, an average-width estimate elsewhere (tests/SSR). */
export const measureText: Measure = (text, fontSize, weight = 500) => {
  if (measureContext === undefined) {
    measureContext = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  }
  if (!measureContext) return text.length * fontSize * 0.56
  measureContext.font = `${weight} ${fontSize}px ${FONT_FAMILY}`
  return measureContext.measureText(text).width
}

const cache = new Map<string, string[]>()
const CACHE_LIMIT = 4000

/** Splits on newlines and wraps words to `maxWidth` (null = no wrapping). Long words are broken. */
export const wrapText = (
  text: string,
  fontSize: number,
  maxWidth: number | null,
  measure: Measure = measureText,
  weight = 500,
): string[] => {
  const key = `${fontSize}|${maxWidth ?? '-'}|${weight}|${text}`
  const hit = cache.get(key)
  if (hit) return hit
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (maxWidth === null || measure(paragraph, fontSize, weight) <= maxWidth) {
      lines.push(paragraph)
      continue
    }
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === '') continue
      const candidate = line + word
      if (measure(candidate, fontSize, weight) <= maxWidth) {
        line = candidate
        continue
      }
      if (line.trim() !== '') lines.push(line.trimEnd())
      line = word.trimStart()
      // Break words that are longer than a whole line.
      while (line.length > 1 && measure(line, fontSize, weight) > maxWidth) {
        let cut = line.length - 1
        while (cut > 1 && measure(line.slice(0, cut), fontSize, weight) > maxWidth) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line.trimEnd())
  }
  if (cache.size > CACHE_LIMIT) cache.clear()
  cache.set(key, lines)
  return lines
}

/** Natural size of a free text element (no wrapping). */
export const textBlockSize = (text: string, fontSize: number, measure: Measure = measureText) => {
  const lines = (text === '' ? ' ' : text).split('\n')
  const width = Math.max(...lines.map((line) => measure(line === '' ? ' ' : line, fontSize)))
  return { w: Math.ceil(width) + 4, h: Math.ceil(lines.length * fontSize * LINE_HEIGHT) }
}

export interface TextLayout {
  lines: string[]
  fontSize: number
  lineHeight: number
  /** Top-left of the text block in element-local coordinates. */
  x: number
  y: number
  align: 'left' | 'center'
  maxWidth: number
}

/**
 * Text layout for any element that carries text. Stickies shrink their font
 * until the text fits; shape labels wrap inside the shape; free text uses its
 * natural size.
 */
export const layoutElementText = (el: ElementData, measure: Measure = measureText): TextLayout | null => {
  const text = el.text ?? ''
  if (text === '' && el.type !== 'text') return null
  const base = el.fontSize ?? DEFAULT_FONT_SIZE
  if (el.type === 'text') {
    const lines = text.split('\n')
    return { lines, fontSize: base, lineHeight: base * LINE_HEIGHT, x: 0, y: 0, align: el.align ?? 'left', maxWidth: el.w }
  }
  const pad = el.type === 'sticky' ? STICKY_PADDING : LABEL_PADDING
  // Ellipses and diamonds have less usable room than their frame.
  const inset = el.type === 'ellipse' ? 0.72 : el.type === 'diamond' ? 0.6 : 1
  const maxWidth = Math.max(8, el.w * inset - pad * 2)
  const maxHeight = Math.max(8, el.h * inset - pad * 2)
  let fontSize = base
  let lines = wrapText(text, fontSize, maxWidth, measure)
  while (fontSize > 9 && lines.length * fontSize * LINE_HEIGHT > maxHeight) {
    fontSize = Math.max(9, Math.floor(fontSize * 0.9))
    lines = wrapText(text, fontSize, maxWidth, measure)
  }
  const lineHeight = fontSize * LINE_HEIGHT
  const blockHeight = lines.length * lineHeight
  const align = el.align ?? 'center'
  return {
    lines,
    fontSize,
    lineHeight,
    x: (el.w - maxWidth) / 2,
    y: (el.h - blockHeight) / 2,
    align,
    maxWidth,
  }
}
