export type ElementType =
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'freedraw'
  | 'text'
  | 'sticky'
  | 'image'

export type Tool =
  | 'select'
  | 'hand'
  | 'freedraw'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'text'
  | 'sticky'
  | 'image'
  | 'eraser'

export type TextAlign = 'left' | 'center'
export type StrokeStyle = 'solid' | 'dashed'

/**
 * Plain snapshot of an element, derived from its Y.Map. All geometry lives in
 * world units. The element's frame is (x, y, w, h), rotated by `rotation`
 * radians around the frame centre. Point based elements (line, arrow, freedraw)
 * keep their points in a local space of size (pw, ph) that is stretched onto
 * the frame, so resizing never needs to rewrite the points.
 */
export interface ElementData {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  rotation: number
  /** Stacking order. Ties are broken by id so every peer renders the same order. */
  z: number
  stroke: string
  fill: string
  strokeWidth: number
  strokeStyle: StrokeStyle
  opacity: number
  /** Flat list: [x, y] pairs for line/arrow, [x, y, pressure] triples for freedraw. */
  points?: number[]
  pw?: number
  ph?: number
  /** Freedraw still being drawn: points are relative to (x, y) and not normalised yet. */
  draft?: boolean
  text?: string
  fontSize?: number
  align?: TextAlign
  /** Image asset id (key in the `assets` map). */
  asset?: string
  arrowStart?: boolean
  arrowEnd?: boolean
  /** Locked elements can be selected by a click but not moved, resized, erased or marquee-selected. */
  locked?: boolean
  /** Monotonic counter bumped on every change, used for render caches. */
  version: number
}

export type ElementInput = Omit<ElementData, 'id' | 'version' | 'z' | 'rotation' | 'strokeStyle' | 'opacity'> &
  Partial<Pick<ElementData, 'id' | 'z' | 'rotation' | 'strokeStyle' | 'opacity'>>

export interface Vec {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Camera {
  /** World coordinate shown at the screen's left/top edge. */
  x: number
  y: number
  zoom: number
}

export interface UserInfo {
  id: string
  name: string
  color: string
}

/** What each peer publishes through Yjs awareness. */
export interface PresenceState {
  user: UserInfo
  cursor: Vec | null
  selection: string[]
  /** Visible world rectangle, used by "follow" mode. */
  viewport: Box | null
  readOnly?: boolean
  editing?: string | null
}

export interface Peer {
  clientId: number
  user: UserInfo
  selection: string[]
  viewport: Box | null
  readOnly: boolean
  isSelf: boolean
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | 'start' | 'end'
