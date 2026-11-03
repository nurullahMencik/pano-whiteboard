import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  ImagePlus,
  Minus,
  MousePointer2,
  PenLine,
  Square,
  StickyNote,
  Type,
  type LucideIcon,
} from 'lucide-react'
import type { TranslationKey } from '../i18n'
import type { Tool } from '../lib/types'

export interface ToolDef {
  tool: Tool
  icon: LucideIcon
  key: string
  label: TranslationKey
  /** Shown in the bottom bar on phones; the rest live in the "more" menu. */
  mobile: boolean
}

export const TOOLS: ToolDef[] = [
  { tool: 'select', icon: MousePointer2, key: 'V', label: 'tool.select', mobile: true },
  { tool: 'hand', icon: Hand, key: 'H', label: 'tool.hand', mobile: false },
  { tool: 'freedraw', icon: PenLine, key: 'P', label: 'tool.freedraw', mobile: true },
  { tool: 'eraser', icon: Eraser, key: 'E', label: 'tool.eraser', mobile: true },
  { tool: 'rect', icon: Square, key: 'R', label: 'tool.rect', mobile: true },
  { tool: 'ellipse', icon: Circle, key: 'O', label: 'tool.ellipse', mobile: false },
  { tool: 'diamond', icon: Diamond, key: 'D', label: 'tool.diamond', mobile: false },
  { tool: 'arrow', icon: ArrowUpRight, key: 'A', label: 'tool.arrow', mobile: true },
  { tool: 'line', icon: Minus, key: 'L', label: 'tool.line', mobile: false },
  { tool: 'text', icon: Type, key: 'T', label: 'tool.text', mobile: true },
  { tool: 'sticky', icon: StickyNote, key: 'S', label: 'tool.sticky', mobile: true },
  { tool: 'image', icon: ImagePlus, key: 'I', label: 'tool.image', mobile: false },
]

export const GROUP_BREAKS = new Set<Tool>(['freedraw', 'rect', 'text'])

/** Opens the hidden file input for the image tool (also used by the `I` shortcut). */
export const PICK_IMAGE_EVENT = 'pano:pick-image'

