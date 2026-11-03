import * as Y from 'yjs'
import { createId } from './ids'
import type { ElementData, ElementInput } from './types'

/**
 * Transaction origins. Only LOCAL_ORIGIN is tracked by the per-user
 * Y.UndoManager, so seeding a template or receiving a remote change never ends
 * up on the local undo stack.
 */
export const LOCAL_ORIGIN = 'pano:local'
export const SEED_ORIGIN = 'pano:seed'

export type YElement = Y.Map<unknown>

/** Scalar fields stored as-is on the element Y.Map. */
const SCALAR_KEYS = [
  'type',
  'x',
  'y',
  'w',
  'h',
  'rotation',
  'z',
  'stroke',
  'fill',
  'strokeWidth',
  'strokeStyle',
  'opacity',
  'pw',
  'ph',
  'draft',
  'fontSize',
  'align',
  'asset',
  'arrowStart',
  'arrowEnd',
  'locked',
] as const satisfies readonly (keyof ElementData)[]

const SCALAR_SET = new Set<string>(SCALAR_KEYS)

export const compareElements = (a: Pick<ElementData, 'z' | 'id'>, b: Pick<ElementData, 'z' | 'id'>) =>
  a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Applies the minimal delete/insert that turns the Y.Text into `next`. */
export const applyTextDiff = (ytext: Y.Text, next: string) => {
  const prev = ytext.toString()
  if (prev === next) return
  let start = 0
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++
  let endPrev = prev.length
  let endNext = next.length
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--
    endNext--
  }
  if (endPrev > start) ytext.delete(start, endPrev - start)
  if (endNext > start) ytext.insert(start, next.slice(start, endNext))
}

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

/** Converts an element Y.Map into a plain snapshot. */
export const readElement = (id: string, ymap: YElement, version = 0): ElementData => {
  const points = ymap.get('points')
  const text = ymap.get('text')
  const type = ymap.get('type') as ElementData['type']
  const el: ElementData = {
    id,
    type,
    x: num(ymap.get('x')),
    y: num(ymap.get('y')),
    w: num(ymap.get('w')),
    h: num(ymap.get('h')),
    rotation: num(ymap.get('rotation')),
    z: num(ymap.get('z')),
    stroke: (ymap.get('stroke') as string | undefined) ?? 'ink',
    fill: (ymap.get('fill') as string | undefined) ?? 'none',
    strokeWidth: num(ymap.get('strokeWidth'), 2),
    strokeStyle: ymap.get('strokeStyle') === 'dashed' ? 'dashed' : 'solid',
    opacity: num(ymap.get('opacity'), 1),
    version,
  }
  if (points instanceof Y.Array) el.points = points.toArray() as number[]
  if (text instanceof Y.Text) el.text = text.toString()
  for (const key of ['pw', 'ph', 'fontSize'] as const) {
    const value = ymap.get(key)
    if (typeof value === 'number') el[key] = value
  }
  for (const key of ['draft', 'arrowStart', 'arrowEnd', 'locked'] as const) {
    if (ymap.get(key) === true) el[key] = true
  }
  const align = ymap.get('align')
  if (align === 'left' || align === 'center') el.align = align
  const asset = ymap.get('asset')
  if (typeof asset === 'string') el.asset = asset
  return el
}

const writeField = (ymap: YElement, key: string, value: unknown) => {
  if (key === 'points') {
    const arr = new Y.Array<number>()
    arr.push(value as number[])
    ymap.set('points', arr)
  } else if (key === 'text') {
    const existing = ymap.get('text')
    if (existing instanceof Y.Text) applyTextDiff(existing, value as string)
    else ymap.set('text', new Y.Text(value as string))
  } else if (SCALAR_SET.has(key)) {
    if (value === undefined) ymap.delete(key)
    else ymap.set(key, value)
  }
}

export type ElementPatch = Partial<Omit<ElementData, 'id' | 'version'>>

/**
 * Thin, typed facade over the shared Y.Doc. Every mutating method runs in its
 * own transaction with the given origin (local by default).
 */
export class BoardModel {
  readonly elements: Y.Map<YElement>
  readonly assets: Y.Map<string>
  readonly meta: Y.Map<unknown>

  constructor(readonly doc: Y.Doc) {
    this.elements = doc.getMap<YElement>('elements')
    this.assets = doc.getMap<string>('assets')
    this.meta = doc.getMap<unknown>('meta')
  }

  transact(fn: () => void, origin: unknown = LOCAL_ORIGIN) {
    this.doc.transact(fn, origin)
  }

  get(id: string): ElementData | null {
    const ymap = this.elements.get(id)
    return ymap ? readElement(id, ymap) : null
  }

  /** All elements sorted bottom → top. */
  all(): ElementData[] {
    const out: ElementData[] = []
    this.elements.forEach((ymap, id) => out.push(readElement(id, ymap)))
    return out.sort(compareElements)
  }

  maxZ(): number {
    let max = 0
    this.elements.forEach((ymap) => {
      max = Math.max(max, num(ymap.get('z')))
    })
    return max
  }

  minZ(): number {
    let min = 0
    this.elements.forEach((ymap) => {
      min = Math.min(min, num(ymap.get('z')))
    })
    return min
  }

  add(input: ElementInput, origin: unknown = LOCAL_ORIGIN): string {
    return this.addMany([input], origin)[0]
  }

  addMany(inputs: ElementInput[], origin: unknown = LOCAL_ORIGIN): string[] {
    const ids: string[] = []
    this.transact(() => {
      let z = this.maxZ()
      for (const input of inputs) {
        const id = input.id ?? createId()
        const ymap = new Y.Map<unknown>()
        const data: Record<string, unknown> = {
          rotation: 0,
          strokeStyle: 'solid',
          opacity: 1,
          ...input,
          z: input.z ?? ++z,
        }
        delete data.id
        delete data.version
        this.elements.set(id, ymap)
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) writeField(ymap, key, value)
        }
        ids.push(id)
      }
    }, origin)
    return ids
  }

  update(id: string, patch: ElementPatch, origin: unknown = LOCAL_ORIGIN) {
    this.updateMany({ [id]: patch }, origin)
  }

  updateMany(patches: Record<string, ElementPatch>, origin: unknown = LOCAL_ORIGIN) {
    this.transact(() => {
      for (const [id, patch] of Object.entries(patches)) {
        const ymap = this.elements.get(id)
        if (!ymap) continue
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'points' || key === 'text' || ymap.get(key) !== value) writeField(ymap, key, value)
        }
      }
    }, origin)
  }

  remove(ids: Iterable<string>, origin: unknown = LOCAL_ORIGIN) {
    this.transact(() => {
      for (const id of ids) this.elements.delete(id)
    }, origin)
  }

  /** Appends samples to an in-progress stroke (cheap incremental CRDT update). */
  appendPoints(id: string, flat: number[], origin: unknown = LOCAL_ORIGIN) {
    const points = this.elements.get(id)?.get('points')
    if (!(points instanceof Y.Array) || flat.length === 0) return
    this.transact(() => (points as Y.Array<number>).push(flat), origin)
  }

  textOf(id: string): Y.Text | null {
    const text = this.elements.get(id)?.get('text')
    return text instanceof Y.Text ? text : null
  }

  setText(id: string, value: string, origin: unknown = LOCAL_ORIGIN) {
    const ymap = this.elements.get(id)
    if (!ymap) return
    this.transact(() => writeField(ymap, 'text', value), origin)
  }

  addAsset(id: string, dataUrl: string, origin: unknown = LOCAL_ORIGIN) {
    if (this.assets.has(id)) return
    this.transact(() => this.assets.set(id, dataUrl), origin)
  }

  assetBytes(): number {
    let total = 0
    this.assets.forEach((value) => {
      total += value.length
    })
    return total
  }

  /* ------------------------------------------------------------ z-order */

  bringToFront(ids: string[]) {
    const selected = this.sortedSubset(ids)
    let z = this.maxZ()
    this.updateMany(Object.fromEntries(selected.map((el) => [el.id, { z: ++z }])))
  }

  sendToBack(ids: string[]) {
    const selected = this.sortedSubset(ids)
    let z = this.minZ() - selected.length - 1
    this.updateMany(Object.fromEntries(selected.map((el) => [el.id, { z: ++z }])))
  }

  /** Moves the selection just above the next unselected element. */
  bringForward(ids: string[]) {
    const set = new Set(ids)
    const all = this.all()
    const selected = all.filter((el) => set.has(el.id))
    if (selected.length === 0) return
    const top = selected[selected.length - 1]
    const above = all.filter((el) => !set.has(el.id) && compareElements(el, top) > 0)
    if (above.length === 0) return
    const lower = above[0].z
    const upper = above.length > 1 ? above[1].z : lower + 2
    this.spread(selected, lower, upper)
  }

  /** Moves the selection just below the previous unselected element. */
  sendBackward(ids: string[]) {
    const set = new Set(ids)
    const all = this.all()
    const selected = all.filter((el) => set.has(el.id))
    if (selected.length === 0) return
    const bottom = selected[0]
    const below = all.filter((el) => !set.has(el.id) && compareElements(el, bottom) < 0)
    if (below.length === 0) return
    const upper = below[below.length - 1].z
    const lower = below.length > 1 ? below[below.length - 2].z : upper - 2
    this.spread(selected, lower, upper)
  }

  private spread(selected: ElementData[], lower: number, upper: number) {
    const step = (upper - lower) / (selected.length + 1)
    this.updateMany(Object.fromEntries(selected.map((el, i) => [el.id, { z: lower + step * (i + 1) }])))
  }

  private sortedSubset(ids: string[]) {
    const set = new Set(ids)
    return this.all().filter((el) => set.has(el.id))
  }

  /** Clones elements (keeping their relative order) and returns the new ids. */
  duplicate(ids: string[], offset = 24): string[] {
    const selected = this.sortedSubset(ids)
    return this.addMany(selected.map((el) => cloneInput(el, offset)))
  }
}

/** Element → creation input (new id, optional offset). */
export const cloneInput = (el: ElementData, offset = 0): ElementInput => {
  const input: ElementInput & { version?: number } = {
    ...el,
    id: createId(),
    x: el.x + offset,
    y: el.y + offset,
    z: undefined,
    points: el.points ? el.points.slice() : undefined,
  }
  delete input.version
  return input
}
