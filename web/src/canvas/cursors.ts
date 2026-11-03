import { contrastText } from '../lib/colors'
import { worldToScreen } from '../lib/geometry'
import type { Camera, Vec } from '../lib/types'

interface RemoteCursor {
  el: HTMLDivElement
  label: HTMLSpanElement
  /** Rendered position (world), eased towards `target`. */
  pos: Vec
  target: Vec
  visible: boolean
  name: string
  color: string
}

const ARROW_PATH = 'M3 2.5 L3 19 L7.6 14.6 L10.6 21.2 L13.6 19.9 L10.7 13.4 L17 13.4 Z'

/**
 * Remote cursors are DOM nodes (crisp at any zoom, cheap to move with a
 * transform). Positions arrive ~25 times a second; each animation frame eases
 * the drawn position towards the latest target so motion looks continuous.
 */
export class CursorLayer {
  private readonly cursors = new Map<number, RemoteCursor>()

  constructor(private readonly root: HTMLElement) {}

  upsert(clientId: number, name: string, color: string, cursor: Vec | null) {
    let entry = this.cursors.get(clientId)
    if (!entry) {
      const el = document.createElement('div')
      el.className = 'pano-cursor'
      el.dataset.testid = 'remote-cursor'
      el.setAttribute('aria-hidden', 'true')
      el.innerHTML = `<svg width="22" height="24" viewBox="0 0 22 24"><path d="${ARROW_PATH}" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg><span></span>`
      const label = el.querySelector('span') as HTMLSpanElement
      this.root.appendChild(el)
      const start = cursor ?? { x: 0, y: 0 }
      entry = { el, label, pos: { ...start }, target: { ...start }, visible: false, name: '', color: '' }
      this.cursors.set(clientId, entry)
    }
    if (entry.name !== name) {
      entry.label.textContent = name
      entry.el.dataset.name = name
      entry.name = name
    }
    if (entry.color !== color) {
      const path = entry.el.querySelector('path')
      path?.setAttribute('fill', color)
      entry.label.style.background = color
      entry.label.style.color = contrastText(color)
      entry.color = color
    }
    if (cursor) {
      if (!entry.visible) entry.pos = { ...cursor }
      entry.target = cursor
      entry.visible = true
      entry.el.style.display = ''
    } else {
      entry.visible = false
      entry.el.style.display = 'none'
    }
  }

  remove(clientId: number) {
    const entry = this.cursors.get(clientId)
    if (!entry) return
    entry.el.remove()
    this.cursors.delete(clientId)
  }

  retain(ids: Set<number>) {
    for (const id of this.cursors.keys()) if (!ids.has(id)) this.remove(id)
  }

  /** Advances the easing; returns true while any cursor is still moving. */
  frame(camera: Camera, dt: number): boolean {
    let moving = false
    const k = 1 - Math.exp(-dt / 55)
    for (const entry of this.cursors.values()) {
      if (!entry.visible) continue
      const dx = entry.target.x - entry.pos.x
      const dy = entry.target.y - entry.pos.y
      if (Math.abs(dx) + Math.abs(dy) > 0.05) {
        entry.pos.x += dx * k
        entry.pos.y += dy * k
        moving = true
      } else {
        entry.pos = { ...entry.target }
      }
      const s = worldToScreen(camera, entry.pos)
      entry.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`
    }
    return moving
  }

  destroy() {
    for (const id of [...this.cursors.keys()]) this.remove(id)
  }
}
