import { deflateSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { createBoard, drag, elements, pickTool } from './helpers'

/** Minimal valid RGB PNG (solid colour) built in memory. */
const solidPng = (width: number, height: number, rgb: [number, number, number]) => {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

test('select, resize, rotate, text, eraser and image tools', async ({ page }) => {
  await createBoard(page)

  // Rectangle, then resize it from the south-east handle and rotate it.
  await pickTool(page, 'rect')
  await drag(page, [600, 300], [760, 400])
  const [rect] = await elements(page)
  expect(rect.w).toBeCloseTo(160, 0)
  const corners = await page.evaluate((id) => window.__PANO__?.corners(id), rect.id)
  if (!corners) throw new Error('no corners')
  await drag(page, [corners[2].x, corners[2].y], [corners[2].x + 80, corners[2].y + 40])
  const resized = (await elements(page))[0]
  expect(resized.w).toBeCloseTo(240, 0)
  expect(resized.h).toBeCloseTo(140, 0)
  const top = await page.evaluate((r) => window.__PANO__?.worldToScreen({ x: r.x + r.w / 2, y: r.y }), resized)
  if (!top) throw new Error('no handle')
  const centre = { x: top.x, y: top.y + (resized.h / 2) * 1 }
  await drag(page, [top.x, top.y - 28], [centre.x + 120, centre.y])
  const rotated = (await elements(page))[0] as unknown as { rotation: number }
  expect(rotated.rotation).toBeGreaterThan(1.3)
  expect(rotated.rotation).toBeLessThan(1.8)

  // Free text.
  await pickTool(page, 'text')
  await page.mouse.click(500, 650)
  await page.keyboard.type('Merhaba')
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await elements(page)).find((el) => el.type === 'text')?.text).toBe('Merhaba')

  // A pen stroke, erased again with the eraser.
  await pickTool(page, 'freedraw')
  await drag(page, [900, 600], [1100, 650], 20)
  await expect.poll(async () => (await elements(page)).some((el) => el.type === 'freedraw')).toBe(true)
  await pickTool(page, 'eraser')
  await drag(page, [1000, 560], [1000, 700], 12)
  await expect.poll(async () => (await elements(page)).some((el) => el.type === 'freedraw')).toBe(false)

  // Image upload through the image tool (downscaled + re-encoded in the browser).
  const chooser = page.waitForEvent('filechooser')
  await pickTool(page, 'image')
  await (await chooser).setFiles({ name: 'kare.png', mimeType: 'image/png', buffer: solidPng(64, 48, [79, 70, 229]) })
  await expect.poll(async () => (await elements(page)).find((el) => el.type === 'image')?.w).toBe(64)
  const image = (await elements(page)).find((el) => el.type === 'image') as unknown as { h: number; asset: string }
  expect(image.h).toBe(48)
  expect(image.asset).toMatch(/^[0-9a-f]{24}$/)
})
