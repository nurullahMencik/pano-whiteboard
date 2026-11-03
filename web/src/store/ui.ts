import { create } from 'zustand'
import type { ConnectionInfo } from '../collab/session'
import { createTranslator, type Lang, type Translate } from '../i18n'
import { INK, NONE, STICKY_COLORS } from '../lib/colors'
import { readJson, writeJson } from '../lib/storage'
import type { ElementType, Peer, StrokeStyle, Tool } from '../lib/types'

export type ThemePref = 'light' | 'dark' | 'system'
export type Dialog = 'share' | 'export' | 'help' | null

export interface ToolStyle {
  stroke: string
  fill: string
  sticky: string
  strokeWidth: number
  strokeStyle: StrokeStyle
  fontSize: number
  opacity: number
}

/** Summary of the current selection, so the style panel can reflect it. */
export interface SelectionInfo {
  count: number
  types: ElementType[]
  stroke: string | null
  fill: string | null
  strokeWidth: number | null
  strokeStyle: StrokeStyle | null
  fontSize: number | null
  opacity: number | null
  locked: boolean
}

interface Prefs {
  theme: ThemePref
  lang: Lang
  style: ToolStyle
}

const PREFS_KEY = 'pano:prefs'

const DEFAULT_STYLE: ToolStyle = {
  stroke: INK,
  fill: NONE,
  sticky: STICKY_COLORS[0],
  strokeWidth: 2,
  strokeStyle: 'solid',
  fontSize: 20,
  opacity: 1,
}

const initialPrefs = (): Prefs => {
  const stored = typeof window === 'undefined' ? null : readJson<Partial<Prefs> | null>(PREFS_KEY, null)
  const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
  const langParam = params?.get('lang')
  const themeParam = params?.get('theme')
  return {
    theme: themeParam === 'dark' || themeParam === 'light' ? themeParam : (stored?.theme ?? 'system'),
    lang: langParam === 'en' || langParam === 'tr' ? langParam : stored?.lang === 'en' ? 'en' : 'tr',
    style: { ...DEFAULT_STYLE, ...(stored?.style ?? {}) },
  }
}

export interface UiState {
  lang: Lang
  t: Translate
  theme: ThemePref
  resolvedTheme: 'light' | 'dark'
  tool: Tool
  style: ToolStyle
  selection: SelectionInfo | null
  zoom: number
  canUndo: boolean
  canRedo: boolean
  elementCount: number
  connection: ConnectionInfo
  peers: Peer[]
  following: number | null
  dialog: Dialog
  toast: { id: number; message: string } | null
  editingText: boolean

  setLang: (lang: Lang) => void
  setTheme: (theme: ThemePref) => void
  setResolvedTheme: (theme: 'light' | 'dark') => void
  setTool: (tool: Tool) => void
  setStyle: (patch: Partial<ToolStyle>) => void
  setDialog: (dialog: Dialog) => void
  showToast: (message: string) => void
  patch: (state: Partial<UiState>) => void
}

const prefs = initialPrefs()

const persist = (state: Pick<UiState, 'theme' | 'lang' | 'style'>) =>
  writeJson(PREFS_KEY, { theme: state.theme, lang: state.lang, style: state.style })

let toastSeq = 0

export const useUi = create<UiState>((set, get) => ({
  lang: prefs.lang,
  t: createTranslator(prefs.lang),
  theme: prefs.theme,
  resolvedTheme: 'light',
  tool: 'select',
  style: prefs.style,
  selection: null,
  zoom: 1,
  canUndo: false,
  canRedo: false,
  elementCount: 0,
  connection: { status: 'connecting', wakingSince: null, everSynced: false },
  peers: [],
  following: null,
  dialog: null,
  toast: null,
  editingText: false,

  setLang: (lang) => {
    set({ lang, t: createTranslator(lang) })
    persist(get())
  },
  setTheme: (theme) => {
    set({ theme })
    persist(get())
  },
  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
  setTool: (tool) => set({ tool }),
  setStyle: (patch) => {
    set({ style: { ...get().style, ...patch } })
    persist(get())
  },
  setDialog: (dialog) => set({ dialog }),
  showToast: (message) => set({ toast: { id: ++toastSeq, message } }),
  patch: (state) => set(state),
}))
