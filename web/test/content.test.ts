import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createTranslator } from '../src/i18n'
import { en } from '../src/i18n/en'
import { tr } from '../src/i18n/tr'
import { buildDemo } from '../src/lib/demo'
import { boardToSvg } from '../src/lib/export'
import { createRoomId, ROOM_ID_PATTERN, VIEW_ID_PATTERN, viewIdFor } from '../src/lib/ids'
import { BoardModel, SEED_ORIGIN } from '../src/lib/model'
import { TEMPLATE_IDS, buildTemplate } from '../src/lib/templates'
import { layoutElementText, wrapText } from '../src/lib/text'

const t = createTranslator('tr')

describe('i18n', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort())
  })

  it('interpolates parameters', () => {
    expect(createTranslator('tr')('people.count', { n: 3 })).toBe('3 kişi çevrimiçi')
    expect(createTranslator('en')('people.count', { n: 3 })).toBe('3 people online')
  })

  it('uses correct Turkish characters', () => {
    expect(tr['home.create']).toBe('Yeni tahta oluştur')
    expect(tr['status.waking']).toBe('Sunucu uyanıyor…')
  })
})

describe('room ids', () => {
  it('creates unguessable ids and derives the same view id as the server', async () => {
    const id = createRoomId()
    expect(id).toMatch(ROOM_ID_PATTERN)
    expect(createRoomId()).not.toBe(id)
    // Known vector (also asserted in the server tests through Node's crypto).
    const viewId = await viewIdFor('AbCdEfGhIjKlMnOpQrStUv')
    expect(viewId).toMatch(VIEW_ID_PATTERN)
    const { createHash } = await import('node:crypto')
    expect(viewId).toBe(createHash('sha256').update('pano:view:AbCdEfGhIjKlMnOpQrStUv').digest('base64url'))
  })
})

describe('templates and demo board', () => {
  it.each(TEMPLATE_IDS)('template %s produces valid elements', (id) => {
    const { elements } = buildTemplate(id, t)
    const model = new BoardModel(new Y.Doc())
    model.addMany(elements, SEED_ORIGIN)
    for (const el of model.all()) {
      expect(Number.isFinite(el.x + el.y + el.w + el.h)).toBe(true)
      expect(el.w).toBeGreaterThanOrEqual(0)
    }
    if (id !== 'blank') expect(model.all().length).toBeGreaterThan(5)
  })

  it('demo board is rich and references its assets', () => {
    const { elements, assets } = buildDemo(t)
    expect(elements.length).toBeGreaterThan(30)
    const types = new Set(elements.map((el) => el.type))
    for (const type of ['sticky', 'freedraw', 'arrow', 'diamond', 'ellipse', 'rect', 'text', 'image']) expect(types).toContain(type)
    for (const el of elements.filter((e) => e.type === 'image')) expect(assets?.[el.asset ?? '']).toMatch(/^data:image\/svg\+xml/)
  })
})

describe('text layout and SVG export', () => {
  const measure = (text: string, size: number) => text.length * size * 0.5

  it('wraps words to the available width', () => {
    const lines = wrapText('bir iki üç dört beş altı', 10, 40, measure)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(40)
  })

  it('shrinks sticky text until it fits', () => {
    const el = {
      id: 's',
      type: 'sticky' as const,
      x: 0,
      y: 0,
      w: 120,
      h: 120,
      rotation: 0,
      z: 0,
      stroke: 'ink',
      fill: '#ffe066',
      strokeWidth: 0,
      strokeStyle: 'solid' as const,
      opacity: 1,
      version: 0,
      fontSize: 22,
      text: 'Bu çok uzun bir yapışkan not metni ve sığması için küçülmesi gerekiyor',
    }
    const layout = layoutElementText(el, measure)
    expect(layout).not.toBeNull()
    expect(layout?.fontSize).toBeLessThan(22)
    expect((layout?.lines.length ?? 0) * (layout?.lineHeight ?? 0)).toBeLessThanOrEqual(120 - 36 + 1)
  })

  it('exports the demo board as a standalone SVG', () => {
    const { elements, assets } = buildDemo(t)
    const model = new BoardModel(new Y.Doc())
    model.addMany(elements, SEED_ORIGIN)
    const { svg, width, height } = boardToSvg(model.all(), {
      theme: 'light',
      background: true,
      assets: (id) => assets?.[id],
      measure,
    })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(width).toBeGreaterThan(1000)
    expect(height).toBeGreaterThan(500)
    expect(svg).toContain('Lansman planı')
    expect(svg).toContain('<image href="data:image/svg+xml')
    expect((svg.match(/<g /g) ?? []).length).toBe(model.all().length)
  })
})
