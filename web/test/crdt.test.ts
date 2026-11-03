import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { lineElement, shapeElement, stickyElement } from '../src/lib/builders'
import { BoardModel, LOCAL_ORIGIN, SEED_ORIGIN, applyTextDiff } from '../src/lib/model'

/** Exchanges the missing updates between two docs (what the server relays). */
const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote')
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote')
}

const peer = (clientID: number) => {
  const doc = new Y.Doc()
  doc.clientID = clientID
  return { doc, model: new BoardModel(doc) }
}

describe('CRDT model: add / update / delete', () => {
  it('adds elements with defaults and increasing z', () => {
    const { model } = peer(1)
    const a = model.add(shapeElement('rect', 0, 0, 100, 50, { fill: '#d0ebff' }))
    const b = model.add(stickyElement(10, 10, 'Merhaba', '#ffe066'))
    const all = model.all()
    expect(all.map((el) => el.id)).toEqual([a, b])
    expect(all[0]).toMatchObject({ type: 'rect', w: 100, h: 50, rotation: 0, opacity: 1, strokeStyle: 'solid', fill: '#d0ebff' })
    expect(all[1]).toMatchObject({ type: 'sticky', text: 'Merhaba' })
    expect(all[1].z).toBeGreaterThan(all[0].z)
  })

  it('updates scalar fields, points and text', () => {
    const { model } = peer(1)
    const id = model.add(lineElement('arrow', { x: 0, y: 0 }, { x: 10, y: 10 }))
    model.update(id, { x: 50, stroke: '#e03e3e', points: [0, 0, 20, 20], w: 20, h: 20 })
    expect(model.get(id)).toMatchObject({ x: 50, stroke: '#e03e3e', points: [0, 0, 20, 20], arrowEnd: true })
    const note = model.add(stickyElement(0, 0, 'eski', '#ffe066'))
    model.setText(note, 'yeni metin')
    expect(model.get(note)?.text).toBe('yeni metin')
  })

  it('deletes elements', () => {
    const { model } = peer(1)
    const ids = model.addMany([stickyElement(0, 0, 'a', '#ffe066'), stickyElement(0, 0, 'b', '#ffe066')])
    model.remove([ids[0]])
    expect(model.all().map((el) => el.id)).toEqual([ids[1]])
    expect(model.get(ids[0])).toBeNull()
  })

  it('appends stroke samples incrementally', () => {
    const { doc, model } = peer(1)
    const id = model.add({ type: 'freedraw', x: 0, y: 0, w: 0, h: 0, stroke: 'ink', fill: 'none', strokeWidth: 3, draft: true, points: [0, 0, 0.5] })
    const updates: Uint8Array[] = []
    doc.on('update', (u: Uint8Array) => updates.push(u))
    model.appendPoints(id, [1, 1, 0.5, 2, 2, 0.5])
    expect(model.get(id)?.points).toHaveLength(9)
    // The incremental update is tiny compared to re-sending the element.
    expect(updates[0].byteLength).toBeLessThan(80)
  })

  it('reorders layers', () => {
    const { model } = peer(1)
    const [a, b, c] = model.addMany([stickyElement(0, 0, 'a', '#fff'), stickyElement(0, 0, 'b', '#fff'), stickyElement(0, 0, 'c', '#fff')])
    model.bringToFront([a])
    expect(model.all().map((el) => el.id)).toEqual([b, c, a])
    model.sendToBack([a])
    expect(model.all().map((el) => el.id)).toEqual([a, b, c])
    model.bringForward([a])
    expect(model.all().map((el) => el.id)).toEqual([b, a, c])
    model.sendBackward([c])
    expect(model.all().map((el) => el.id)).toEqual([b, c, a])
  })

  it('duplicates with new ids and an offset', () => {
    const { model } = peer(1)
    const id = model.add(stickyElement(10, 20, 'kopya', '#ffe066'))
    const [copy] = model.duplicate([id], 24)
    expect(copy).not.toBe(id)
    expect(model.get(copy)).toMatchObject({ x: 34, y: 44, text: 'kopya' })
  })

  it('applies minimal text diffs', () => {
    const doc = new Y.Doc()
    const text = doc.getText('t')
    text.insert(0, 'Merhaba dünya')
    const deltas: unknown[] = []
    text.observe((e) => deltas.push(e.delta))
    applyTextDiff(text, 'Merhaba güzel dünya')
    expect(text.toString()).toBe('Merhaba güzel dünya')
    expect(deltas[0]).toEqual([{ retain: 8 }, { insert: 'güzel ' }])
  })
})

describe('CRDT merge of concurrent edits', () => {
  it('merges concurrent edits to different fields of the same element', () => {
    const a = peer(1)
    const b = peer(2)
    const id = a.model.add(shapeElement('rect', 0, 0, 100, 100))
    sync(a.doc, b.doc)

    a.model.update(id, { x: 300, y: 120 }) // A moves it
    b.model.update(id, { fill: '#d3f9d8', stroke: '#2f9e44' }) // B recolours it, concurrently
    sync(a.doc, b.doc)

    for (const p of [a, b]) {
      expect(p.model.get(id)).toMatchObject({ x: 300, y: 120, fill: '#d3f9d8', stroke: '#2f9e44' })
    }
  })

  it('converges to the same value when both peers change the same field', () => {
    const a = peer(1)
    const b = peer(2)
    const id = a.model.add(shapeElement('rect', 0, 0, 100, 100))
    sync(a.doc, b.doc)
    a.model.update(id, { x: 111 })
    b.model.update(id, { x: 222 })
    sync(a.doc, b.doc)
    expect(a.model.get(id)?.x).toBe(b.model.get(id)?.x)
    expect([111, 222]).toContain(a.model.get(id)?.x)
  })

  it('keeps both elements when peers add concurrently', () => {
    const a = peer(1)
    const b = peer(2)
    const fromA = a.model.add(stickyElement(0, 0, 'A', '#ffe066'))
    const fromB = b.model.add(stickyElement(0, 0, 'B', '#a5d8ff'))
    sync(a.doc, b.doc)
    expect(a.model.all().map((el) => el.id).sort()).toEqual([fromA, fromB].sort())
    // Both peers agree on the stacking order even though z values tie.
    expect(a.model.all().map((el) => el.id)).toEqual(b.model.all().map((el) => el.id))
  })

  it('a delete wins over a concurrent update of the deleted element', () => {
    const a = peer(1)
    const b = peer(2)
    const id = a.model.add(stickyElement(0, 0, 'x', '#ffe066'))
    sync(a.doc, b.doc)
    a.model.remove([id])
    b.model.update(id, { x: 500 })
    sync(a.doc, b.doc)
    expect(a.model.get(id)).toBeNull()
    expect(b.model.get(id)).toBeNull()
  })

  it('merges concurrent typing in the same sticky note character-wise', () => {
    const a = peer(1)
    const b = peer(2)
    const id = a.model.add(stickyElement(0, 0, 'Plan', '#ffe066'))
    sync(a.doc, b.doc)
    a.model.setText(id, 'Lansman Plan')
    b.model.setText(id, 'Plan hazır')
    sync(a.doc, b.doc)
    expect(a.model.get(id)?.text).toBe('Lansman Plan hazır')
    expect(b.model.get(id)?.text).toBe('Lansman Plan hazır')
  })

  it('merges concurrent appends to the same stroke and edits made offline', () => {
    const a = peer(1)
    const b = peer(2)
    const id = a.model.add({ type: 'freedraw', x: 0, y: 0, w: 0, h: 0, stroke: 'ink', fill: 'none', strokeWidth: 3, draft: true, points: [0, 0, 0.5] })
    sync(a.doc, b.doc)
    // B goes "offline" and keeps working while A keeps drawing.
    a.model.appendPoints(id, [5, 5, 0.5])
    const offline = b.model.add(shapeElement('ellipse', 0, 0, 40, 40))
    b.model.update(id, { stroke: '#7048e8' })
    sync(a.doc, b.doc)
    expect(a.model.get(offline)).not.toBeNull()
    expect(a.model.get(id)).toMatchObject({ stroke: '#7048e8', points: [0, 0, 0.5, 5, 5, 0.5] })
    expect(Y.encodeStateVector(a.doc)).toEqual(Y.encodeStateVector(b.doc))
  })
})

describe('per-user undo (Y.UndoManager)', () => {
  const undoFor = (model: BoardModel) =>
    new Y.UndoManager([model.elements, model.assets], { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 0 })

  it('undoes only the local user’s changes', () => {
    const a = peer(1)
    const b = peer(2)
    const undoA = undoFor(a.model)
    const mine = a.model.add(stickyElement(0, 0, 'A', '#ffe066'))
    sync(a.doc, b.doc)
    const theirs = b.model.add(stickyElement(100, 0, 'B', '#a5d8ff'))
    b.model.update(mine, { fill: '#b2f2bb' }) // B also edits A's note
    sync(a.doc, b.doc)

    undoA.undo()
    sync(a.doc, b.doc)
    // A's creation is undone (so the note disappears), B's own element survives.
    expect(a.model.get(mine)).toBeNull()
    expect(a.model.get(theirs)).not.toBeNull()
    expect(b.model.get(theirs)).not.toBeNull()

    undoA.redo()
    sync(a.doc, b.doc)
    expect(a.model.get(mine)).not.toBeNull()
  })

  it('never reverts a remote edit, even when it is the most recent change', () => {
    const a = peer(1)
    const b = peer(2)
    const undoA = undoFor(a.model)
    const id = a.model.add(shapeElement('rect', 0, 0, 10, 10))
    a.model.update(id, { x: 50 })
    sync(a.doc, b.doc)
    b.model.update(id, { fill: '#ffe3e3' })
    sync(a.doc, b.doc)

    undoA.undo() // reverts A's move only
    expect(a.model.get(id)).toMatchObject({ x: 0, fill: '#ffe3e3' })
    sync(a.doc, b.doc)
    expect(b.model.get(id)).toMatchObject({ x: 0, fill: '#ffe3e3' })
  })

  it('ignores seeded template content', () => {
    const a = peer(1)
    const undoA = undoFor(a.model)
    a.model.add(stickyElement(0, 0, 'seed', '#ffe066'), SEED_ORIGIN)
    expect(undoA.undoStack).toHaveLength(0)
    undoA.undo()
    expect(a.model.all()).toHaveLength(1)
  })
})
