/**
 * Colour tokens. "ink" adapts to the theme (near black on light, near white on
 * dark) so the default stroke stays readable in both. Everything else is a
 * literal colour stored in the document.
 */
export const INK = 'ink'
export const NONE = 'none'

export type ThemeName = 'light' | 'dark'

export type ColorName = 'ink' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'pink' | 'gray' | 'peach' | 'none'

export interface Swatch {
  value: string
  name: ColorName
  light?: boolean
}

export const STROKE_SWATCHES: Swatch[] = [
  { value: INK, name: 'ink' },
  { value: '#e03e3e', name: 'red' },
  { value: '#e8590c', name: 'orange' },
  { value: '#d9a400', name: 'yellow' },
  { value: '#2f9e44', name: 'green' },
  { value: '#1c7ed6', name: 'blue' },
  { value: '#7048e8', name: 'violet' },
  { value: '#c2255c', name: 'pink' },
]

export const FILL_SWATCHES: Swatch[] = [
  { value: NONE, name: 'none' },
  { value: '#ffe3e3', name: 'red', light: true },
  { value: '#ffe8cc', name: 'orange', light: true },
  { value: '#fff3bf', name: 'yellow', light: true },
  { value: '#d3f9d8', name: 'green', light: true },
  { value: '#d0ebff', name: 'blue', light: true },
  { value: '#e5dbff', name: 'violet', light: true },
  { value: '#f1f3f5', name: 'gray', light: true },
]

/** Sticky note palette (paper-like, readable with dark text in both themes). */
export const STICKY_SWATCHES: Swatch[] = [
  { value: '#ffe066', name: 'yellow' },
  { value: '#ffc9a9', name: 'peach' },
  { value: '#ffb3c7', name: 'pink' },
  { value: '#b2f2bb', name: 'green' },
  { value: '#a5d8ff', name: 'blue' },
  { value: '#d0bfff', name: 'violet' },
  { value: '#e9ecef', name: 'gray' },
]

export const STICKY_COLORS = STICKY_SWATCHES.map((s) => s.value)

/** Presence colours: saturated, distinct, readable with white text. */
export const USER_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#d9480f', '#5c940d'] as const

export const THEME = {
  light: {
    ink: '#1b1f2a',
    canvas: '#f7f6f2',
    grid: 'rgba(27, 31, 42, 0.13)',
    selection: '#4f46e5',
    selectionFill: 'rgba(79, 70, 229, 0.08)',
    handleFill: '#ffffff',
    stickyText: '#1b1f2a',
    stickyShadow: 'rgba(27, 31, 42, 0.18)',
  },
  dark: {
    ink: '#e9eaf0',
    canvas: '#16181f',
    grid: 'rgba(233, 234, 240, 0.12)',
    selection: '#8b85ff',
    selectionFill: 'rgba(139, 133, 255, 0.12)',
    handleFill: '#16181f',
    stickyText: '#1b1f2a',
    stickyShadow: 'rgba(0, 0, 0, 0.45)',
  },
} as const

export const resolveColor = (color: string, theme: ThemeName): string => {
  if (color === INK) return THEME[theme].ink
  return color
}

/** Picks a readable text colour (dark or white) for a given background. */
export const contrastText = (hex: string): string => {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#ffffff'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#1b1f2a' : '#ffffff'
}
