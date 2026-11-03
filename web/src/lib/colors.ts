/**
 * Colour tokens. "ink" adapts to the theme (near black on light, near white on
 * dark) so the default stroke stays readable in both. Everything else is a
 * literal colour stored in the document.
 */
export const INK = 'ink'
export const NONE = 'none'

export type ThemeName = 'light' | 'dark'

export const STROKE_COLORS = [INK, '#e03e3e', '#e8590c', '#d9a400', '#2f9e44', '#1c7ed6', '#7048e8', '#c2255c'] as const

export const FILL_COLORS = [NONE, '#ffe3e3', '#ffe8cc', '#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#f1f3f5'] as const

/** Sticky note palette (paper-like, readable with dark text in both themes). */
export const STICKY_COLORS = ['#ffe066', '#ffc9a9', '#ffb3c7', '#b2f2bb', '#a5d8ff', '#d0bfff', '#e9ecef'] as const

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
