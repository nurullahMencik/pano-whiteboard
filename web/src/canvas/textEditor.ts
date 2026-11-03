import type * as Y from 'yjs'
import { THEME, resolveColor, type ThemeName } from '../lib/colors'
import { boxCenter, frameOf, worldToScreen } from '../lib/geometry'
import { LOCAL_ORIGIN, type BoardModel } from '../lib/model'
import { labelColor } from '../lib/render'
import { FONT_FAMILY, LINE_HEIGHT, layoutElementText, textBlockSize } from '../lib/text'
import type { Camera, ElementData } from '../lib/types'

interface EditorDeps {
  root: HTMLElement
  model: BoardModel
  id: string
  getElement: () => ElementData | undefined
  getCamera: () => Camera
  getTheme: () => ThemeName
  onDone: (id: string) => void
  onUndo: () => void
  onRedo: () => void
  label: string
}

/**
 * In-place text editing: a transparent textarea laid over the element and
 * bound to its Y.Text. Local input is applied as a minimal diff; remote edits
 * update the textarea while preserving the caret (so two people can type in
 * the same sticky note at once).
 */
export class TextEditor {
  readonly textarea: HTMLTextAreaElement
  private readonly ytext: Y.Text | null
  private done = false

  constructor(private readonly deps: EditorDeps) {
    const el = deps.getElement()
    this.ytext = deps.model.textOf(deps.id)
    const ta = document.createElement('textarea')
    ta.className = 'pano-text-editor'
    ta.dataset.testid = 'text-editor'
    ta.setAttribute('aria-label', deps.label)
    ta.spellcheck = false
    ta.value = this.ytext?.toString() ?? el?.text ?? ''
    ta.wrap = el?.type === 'text' ? 'off' : 'soft'
    this.textarea = ta
    deps.root.appendChild(ta)
    this.position()
    ta.focus({ preventScroll: true })
    ta.setSelectionRange(ta.value.length, ta.value.length)

    ta.addEventListener('input', this.handleInput)
    ta.addEventListener('keydown', this.handleKeyDown)
    ta.addEventListener('blur', this.handleBlur)
    ta.addEventListener('pointerdown', (e) => e.stopPropagation())
    this.ytext?.observe(this.handleRemote)
  }

  private readonly handleInput = () => {
    const value = this.textarea.value
    const el = this.deps.getElement()
    if (!el) return
    this.deps.model.transact(() => {
      this.deps.model.setText(this.deps.id, value)
      if (el.type === 'text') {
        const size = textBlockSize(value, el.fontSize ?? 20)
        this.deps.model.update(this.deps.id, { w: size.w, h: size.h })
      }
    })
    this.position()
  }

  private readonly handleRemote = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return
    let start = this.textarea.selectionStart
    let end = this.textarea.selectionEnd
    let index = 0
    for (const op of event.delta) {
      if (op.retain !== undefined) index += op.retain
      else if (typeof op.insert === 'string') {
        const len = op.insert.length
        if (index <= start) start += len
        if (index < end) end += len
        index += len
      } else if (op.delete !== undefined) {
        if (index < start) start -= Math.min(op.delete, start - index)
        if (index < end) end -= Math.min(op.delete, end - index)
      }
    }
    this.textarea.value = this.ytext?.toString() ?? ''
    this.textarea.setSelectionRange(start, end)
    this.position()
  }

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape' || (e.key === 'Enter' && mod)) {
      e.preventDefault()
      this.commit()
      return
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) this.deps.onRedo()
      else this.deps.onUndo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      this.deps.onRedo()
    }
  }

  private readonly handleBlur = () => this.commit()

  /** Lays the textarea over the element using the current camera. */
  position() {
    const el = this.deps.getElement()
    if (!el) {
      this.commit()
      return
    }
    const cam = this.deps.getCamera()
    const frame = frameOf(el)
    const ta = this.textarea
    const zoom = cam.zoom
    const theme = this.deps.getTheme()
    const center = worldToScreen(cam, boxCenter(frame))
    const frameW = frame.w * zoom
    const frameH = frame.h * zoom
    let width = frameW
    const style = ta.style
    style.fontFamily = FONT_FAMILY
    style.lineHeight = String(LINE_HEIGHT)
    if (el.type === 'text') {
      const fontSize = el.fontSize ?? 20
      const size = textBlockSize(ta.value, fontSize)
      // Extra room on the right so the next character never clips before the doc catches up.
      width = Math.max(size.w + fontSize * 2, 40) * zoom
      style.fontSize = `${fontSize * zoom}px`
      style.padding = '0'
      style.textAlign = 'left'
      style.color = resolveColor(el.stroke, theme)
    } else {
      const layout = layoutElementText({ ...el, text: ta.value === '' ? ' ' : ta.value })
      const fontSize = layout?.fontSize ?? el.fontSize ?? 20
      const padX = layout ? ((frame.w - layout.maxWidth) / 2) * zoom : 12 * zoom
      const padY = layout ? Math.max(0, layout.y * zoom) : 0
      style.fontSize = `${fontSize * zoom}px`
      style.padding = `${padY}px ${padX}px 0`
      style.textAlign = 'center'
      style.color = el.type === 'sticky' ? THEME[theme].stickyText : labelColor(el, theme)
    }
    style.left = `${center.x - frameW / 2}px`
    style.top = `${center.y - frameH / 2}px`
    style.width = `${width}px`
    style.height = `${Math.max(frameH, 8)}px`
    // Rotate around the element centre, exactly like the canvas does.
    style.transformOrigin = `${frameW / 2}px ${frameH / 2}px`
    style.transform = el.rotation ? `rotate(${el.rotation}rad)` : ''
  }

  commit() {
    if (this.done) return
    this.done = true
    this.ytext?.unobserve(this.handleRemote)
    this.textarea.removeEventListener('blur', this.handleBlur)
    this.textarea.remove()
    this.deps.onDone(this.deps.id)
  }
}
