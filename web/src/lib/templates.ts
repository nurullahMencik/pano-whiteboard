import type { Translate } from '../i18n'
import { lineElement, shapeElement, stickyElement, textElement } from './builders'
import { STICKY_COLORS } from './colors'
import type { ElementInput } from './types'

export type TemplateId = 'blank' | 'retro' | 'flow' | 'brainstorm'

export const TEMPLATE_IDS: TemplateId[] = ['blank', 'retro', 'flow', 'brainstorm']

export interface SeedContent {
  elements: ElementInput[]
  assets?: Record<string, string>
}

const retro = (t: Translate): SeedContent => {
  const columns = [
    { title: t('tpl.retro.good'), tint: '#e6f6e9', accent: '#2f9e44', sticky: STICKY_COLORS[3], sample: t('tpl.retro.sample1') },
    { title: t('tpl.retro.improve'), tint: '#fff0e1', accent: '#e8590c', sticky: STICKY_COLORS[1], sample: t('tpl.retro.sample2') },
    { title: t('tpl.retro.actions'), tint: '#e3f0fd', accent: '#1c7ed6', sticky: STICKY_COLORS[4], sample: t('tpl.retro.sample3') },
  ]
  const elements: ElementInput[] = [
    textElement(0, -120, t('tpl.retro.title'), 40),
    textElement(2, -62, t('tpl.retro.hint'), 18, { opacity: 0.6 }),
  ]
  columns.forEach((col, i) => {
    const x = i * 400
    elements.push(shapeElement('rect', x, 0, 370, 620, { fill: col.tint, stroke: col.tint, strokeWidth: 0, locked: true }))
    elements.push(shapeElement('rect', x + 24, 26, 10, 26, { fill: col.accent, stroke: col.accent, strokeWidth: 0, locked: true }))
    elements.push(textElement(x + 46, 24, col.title, 24, { locked: true }))
    elements.push(stickyElement(x + 24, 84, col.sample, col.sticky, 150))
  })
  return { elements }
}

const flow = (t: Translate): SeedContent => {
  const cx = 300
  const elements: ElementInput[] = [
    textElement(0, -110, t('tpl.flow.title'), 40),
    shapeElement('ellipse', cx - 90, 0, 180, 76, { text: t('tpl.flow.start'), fill: '#d3f9d8', stroke: '#2f9e44' }),
    shapeElement('rect', cx - 120, 150, 240, 90, { text: t('tpl.flow.step1'), fill: '#f1f3f5' }),
    shapeElement('diamond', cx - 130, 320, 260, 150, { text: t('tpl.flow.decision'), fill: '#fff3bf', stroke: '#d9a400' }),
    shapeElement('rect', cx - 120, 560, 240, 90, { text: t('tpl.flow.step2'), fill: '#d0ebff', stroke: '#1c7ed6' }),
    shapeElement('rect', cx + 260, 350, 240, 90, { text: t('tpl.flow.step3'), fill: '#ffe3e3', stroke: '#e03e3e' }),
    shapeElement('ellipse', cx - 90, 730, 180, 76, { text: t('tpl.flow.end'), fill: '#d3f9d8', stroke: '#2f9e44' }),
    lineElement('arrow', { x: cx, y: 82 }, { x: cx, y: 142 }),
    lineElement('arrow', { x: cx, y: 246 }, { x: cx, y: 312 }),
    lineElement('arrow', { x: cx, y: 476 }, { x: cx, y: 552 }),
    lineElement('arrow', { x: cx + 136, y: 395 }, { x: cx + 252, y: 395 }),
    lineElement('arrow', { x: cx + 380, y: 342 }, { x: cx + 126, y: 200 }, { strokeStyle: 'dashed' }),
    lineElement('arrow', { x: cx, y: 656 }, { x: cx, y: 722 }),
    textElement(cx + 14, 498, t('tpl.flow.yes'), 18, { stroke: '#2f9e44' }),
    textElement(cx + 160, 360, t('tpl.flow.no'), 18, { stroke: '#e03e3e' }),
  ]
  return { elements }
}

const brainstorm = (t: Translate): SeedContent => {
  const elements: ElementInput[] = [textElement(-140, -380, t('tpl.brainstorm.title'), 40)]
  elements.push(shapeElement('ellipse', -140, -80, 280, 160, { text: t('tpl.brainstorm.center'), fill: '#e5dbff', stroke: '#7048e8', fontSize: 26 }))
  const count = 6
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i / count) * Math.PI * 2
    const r = 340
    const sx = Math.cos(angle) * r
    const sy = Math.sin(angle) * r
    const start = { x: Math.cos(angle) * 150, y: Math.sin(angle) * 90 }
    const end = { x: Math.cos(angle) * (r - 95), y: Math.sin(angle) * (r - 95) }
    elements.push(lineElement('line', start, end, { stroke: '#7048e8', strokeWidth: 2 }))
    elements.push(stickyElement(sx - 75, sy - 75, t('tpl.brainstorm.idea', { n: i + 1 }), STICKY_COLORS[i % STICKY_COLORS.length], 150))
  }
  return { elements }
}

export const buildTemplate = (id: TemplateId, t: Translate): SeedContent => {
  switch (id) {
    case 'retro':
      return retro(t)
    case 'flow':
      return flow(t)
    case 'brainstorm':
      return brainstorm(t)
    case 'blank':
      return { elements: [] }
  }
}
