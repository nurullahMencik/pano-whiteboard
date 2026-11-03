import type { Translate } from '../i18n'
import {
  freedrawElement,
  lineElement,
  shapeElement,
  sketchCheck,
  sketchCircle,
  sketchStar,
  sketchUnderline,
  sketchWave,
  stickyElement,
  textElement,
} from './builders'
import type { SeedContent } from './templates'
import type { ElementInput } from './types'

const chartSvg = (title: string) => {
  const values = [18, 26, 24, 35, 41, 58]
  const max = 60
  const bars = values
    .map((v, i) => {
      const h = (v / max) * 150
      const x = 34 + i * 58
      const color = i === values.length - 1 ? '#e8590c' : '#4f46e5'
      return (
        `<rect x="${x}" y="${208 - h}" width="38" height="${h}" rx="7" fill="${color}" opacity="${i === values.length - 1 ? 1 : 0.35 + i * 0.1}"/>` +
        `<text x="${x + 19}" y="228" font-size="13" text-anchor="middle" fill="#5f6577">H${i + 1}</text>`
      )
    })
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240" font-family="Inter, system-ui, sans-serif">` +
    `<rect width="400" height="240" rx="16" fill="#ffffff"/>` +
    `<text x="24" y="34" font-size="17" font-weight="600" fill="#1b1f2a">${title}</text>` +
    `<text x="376" y="34" font-size="15" font-weight="700" text-anchor="end" fill="#2f9e44">+41%</text>` +
    `<line x1="24" y1="208.5" x2="376" y2="208.5" stroke="#e1e3ea"/>` +
    bars +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** The pre-built showcase board: a retro, a release flow, a chart and sketches. */
export const buildDemo = (t: Translate): SeedContent => {
  const elements: ElementInput[] = []

  // Header
  elements.push(textElement(0, -178, t('demo.title'), 46))
  elements.push(freedrawElement(sketchUnderline(2, -112, 470, 11), { stroke: '#e8590c', strokeWidth: 4 }))
  elements.push(textElement(2, -88, t('demo.subtitle'), 20, { opacity: 0.6 }))

  // Retro columns
  const columns = [
    { title: t('demo.good'), tint: '#e6f6e9', accent: '#2f9e44' },
    { title: t('demo.improve'), tint: '#fff0e1', accent: '#e8590c' },
    { title: t('demo.actions'), tint: '#e3f0fd', accent: '#1c7ed6' },
  ]
  columns.forEach((col, i) => {
    const x = i * 380
    elements.push(shapeElement('rect', x, -40, 350, 600, { fill: col.tint, stroke: col.tint, strokeWidth: 0, locked: true }))
    elements.push(shapeElement('rect', x + 24, -14, 10, 26, { fill: col.accent, stroke: col.accent, strokeWidth: 0, locked: true }))
    elements.push(textElement(x + 46, -16, col.title, 24, { locked: true }))
  })

  elements.push(stickyElement(24, 44, t('demo.good1'), '#b2f2bb', 145, { rotation: -0.02 }))
  elements.push(stickyElement(181, 52, t('demo.good2'), '#ffe066', 145, { rotation: 0.025 }))
  elements.push(stickyElement(40, 222, t('demo.good3'), '#ffe066', 145, { rotation: 0.015 }))
  elements.push(freedrawElement(sketchCircle(112, 294, 104, 100, 21), { stroke: '#e03e3e', strokeWidth: 3 }))

  elements.push(stickyElement(404, 44, t('demo.improve1'), '#ffb3c7', 145, { rotation: 0.02 }))
  elements.push(stickyElement(561, 70, t('demo.improve2'), '#ffc9a9', 145, { rotation: -0.03 }))

  elements.push(stickyElement(784, 44, t('demo.action1'), '#a5d8ff', 145, { rotation: -0.015 }))
  elements.push(stickyElement(941, 60, t('demo.action2'), '#d0bfff', 145, { rotation: 0.02 }))
  elements.push(freedrawElement(sketchCheck(1046, -30, 40, 31), { stroke: '#2f9e44', strokeWidth: 4 }))

  // Release flow
  const fx = 1230
  elements.push(textElement(fx, -46, t('demo.flowTitle'), 28))
  elements.push(shapeElement('ellipse', fx + 70, 20, 170, 70, { text: t('demo.flow1'), fill: '#e5dbff', stroke: '#7048e8' }))
  elements.push(shapeElement('rect', fx + 60, 140, 190, 80, { text: t('demo.flow2'), fill: '#d0ebff', stroke: '#1c7ed6' }))
  elements.push(shapeElement('diamond', fx + 40, 270, 230, 140, { text: t('demo.flow3'), fill: '#fff3bf', stroke: '#d9a400', fontSize: 18 }))
  elements.push(shapeElement('rect', fx + 60, 470, 190, 80, { text: t('demo.flow4'), fill: '#d3f9d8', stroke: '#2f9e44' }))
  elements.push(shapeElement('rect', fx + 330, 300, 160, 80, { text: t('demo.flow5'), fill: '#ffe3e3', stroke: '#e03e3e' }))
  elements.push(lineElement('arrow', { x: fx + 155, y: 96 }, { x: fx + 155, y: 132 }))
  elements.push(lineElement('arrow', { x: fx + 155, y: 226 }, { x: fx + 155, y: 262 }))
  elements.push(lineElement('arrow', { x: fx + 155, y: 416 }, { x: fx + 155, y: 462 }))
  elements.push(lineElement('arrow', { x: fx + 276, y: 340 }, { x: fx + 322, y: 340 }))
  elements.push(lineElement('arrow', { x: fx + 410, y: 292 }, { x: fx + 258, y: 186 }, { strokeStyle: 'dashed', stroke: '#e03e3e' }))
  elements.push(textElement(fx + 166, 424, t('demo.yes'), 16, { stroke: '#2f9e44' }))
  elements.push(textElement(fx + 280, 304, t('demo.no'), 16, { stroke: '#e03e3e' }))
  elements.push(freedrawElement(sketchStar(fx + 300, 512, 26, 41), { stroke: '#e8590c', strokeWidth: 3 }))
  elements.push(textElement(fx + 336, 494, t('demo.ship'), 24, { stroke: '#e8590c', rotation: -0.06 }))

  // Bottom row: chart, big sticky, doodles
  elements.push({ type: 'image', x: 0, y: 610, w: 400, h: 240, stroke: 'ink', fill: 'none', strokeWidth: 0, asset: 'demo-chart' })
  elements.push(stickyElement(450, 628, t('demo.note'), '#ffe066', 190, { rotation: -0.04, fontSize: 26 }))
  elements.push(freedrawElement(sketchWave(680, 720, 300, 14, 51), { stroke: '#7048e8', strokeWidth: 3 }))
  elements.push(lineElement('arrow', { x: 1000, y: 718 }, { x: fx + 52, y: 520 }, { stroke: '#7048e8', strokeWidth: 3 }))
  elements.push(shapeElement('ellipse', 760, 790, 220, 70, { text: 'MVP 1.0', fill: 'none', stroke: '#2f9e44', strokeStyle: 'dashed' }))

  return { elements, assets: { 'demo-chart': chartSvg(t('demo.metric')) } }
}
