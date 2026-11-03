// Frame-time benchmark: pastes N mixed elements into a fresh board and pans for
// 3 s at several zoom levels, one wheel event per animation frame.
// Usage (preview on :5311 and server on :5312 running):  node scripts/perf-bench.mjs 5000
import { chromium } from '@playwright/test'

const N = Number(process.argv[2] ?? 3000)
const BASE = process.env.BASE_URL ?? 'http://localhost:5311/pano-whiteboard/'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto(BASE)
await page.getByRole('button', { name: 'Yeni tahta oluştur' }).click()
await page.waitForSelector('canvas')
await page.waitForTimeout(800)

await page.evaluate((n) => {
  const elements = []
  const colors = ['#ffe066', '#a5d8ff', '#b2f2bb', '#ffc9a9']
  for (let i = 0; i < n; i++) {
    const base = { id: 'e' + i, x: (i % 50) * 90, y: Math.floor(i / 50) * 90, w: 70, h: 70, rotation: (i % 7) * 0.05, z: i, stroke: 'ink', fill: 'none', strokeWidth: 2, strokeStyle: 'solid', opacity: 1, version: 0 }
    const kind = i % 4
    if (kind === 0) elements.push({ ...base, type: 'sticky', fill: colors[i % 4], text: 'Not ' + i, fontSize: 18, align: 'center' })
    else if (kind === 1) elements.push({ ...base, type: 'rect', fill: '#d0ebff' })
    else if (kind === 2) elements.push({ ...base, type: 'ellipse', text: 'E' + i, fontSize: 14, align: 'center' })
    else {
      const points = []
      for (let k = 0; k < 60; k++) points.push(k * 1.1, 35 + Math.sin(k / 6) * 25, 0.6)
      elements.push({ ...base, type: 'freedraw', points, pw: 66, ph: 50, h: 50 })
    }
  }
  const data = new DataTransfer()
  data.setData('text/plain', JSON.stringify({ pano: 1, elements, assets: {} }))
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }))
}, N)
await page.waitForTimeout(500)
await page.keyboard.press('Escape')

const measure = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const board = document.querySelector('[data-testid=board]')
        const times = []
        let last = performance.now()
        const start = last
        const step = (t) => {
          times.push(t - last)
          last = t
          board.dispatchEvent(new WheelEvent('wheel', { deltaX: 6, deltaY: 3, bubbles: true, cancelable: true, clientX: 700, clientY: 450 }))
          if (t - start < 3000) requestAnimationFrame(step)
          else {
            times.shift()
            times.sort((a, b) => a - b)
            const avg = times.reduce((a, b) => a + b, 0) / times.length
            resolve({ fps: Number((1000 / avg).toFixed(1)), avgMs: Number(avg.toFixed(2)), p95Ms: Number(times[Math.floor(times.length * 0.95)].toFixed(2)) })
          }
        }
        requestAnimationFrame(step)
      }),
  )

console.log(`elements: ${await page.evaluate(() => window.__PANO__.elements().length)}`)
await page.evaluate(() => window.__PANO__.fit())
await page.waitForTimeout(300)
console.log(`zoom ${(await page.evaluate(() => window.__PANO__.camera().zoom)).toFixed(2)} (everything visible):`, await measure())
for (const zoom of [0.35, 1]) {
  await page.evaluate((z) => window.__PANO__.setCamera({ x: 0, y: 0, zoom: z }), zoom)
  await page.waitForTimeout(300)
  console.log(`zoom ${zoom}:`, await measure())
}
await browser.close()
