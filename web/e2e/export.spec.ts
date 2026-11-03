import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createBoard, elements } from './helpers'

const pngSize = (buffer: Buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) })

test('exports the whole board and a selection as PNG, and as SVG', async ({ page }) => {
  await createBoard(page, 'Demo tahtayı aç')
  await expect.poll(async () => (await elements(page)).length).toBeGreaterThan(30)

  await page.getByRole('button', { name: 'Dışa aktar' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Dışa aktar' })
  await expect(dialog).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('export-download').click()])
  expect(download.suggestedFilename()).toMatch(/^pano-\d{4}-\d{2}-\d{2}\.png$/)
  const file = await readFile(await download.path())
  expect(file.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const whole = pngSize(file)
  expect(whole.width).toBeGreaterThan(2000)
  expect(whole.height).toBeGreaterThan(1000)

  // Select a single sticky note and export only that.
  const sticky = (await elements(page)).find((el) => el.type === 'sticky')
  if (!sticky) throw new Error('demo has no sticky')
  const centre = await page.evaluate((s) => window.__PANO__?.worldToScreen({ x: s.x + s.w / 2, y: s.y + s.h / 2 }), sticky)
  await page.mouse.click(centre?.x ?? 0, centre?.y ?? 0)
  await expect.poll(() => page.evaluate(() => window.__PANO__?.selection().length)).toBe(1)
  await page.getByRole('button', { name: 'Dışa aktar' }).first().click()
  await dialog.getByRole('radio', { name: /Seçili nesneler/ }).click()
  const [selectionDownload] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('export-download').click()])
  const part = pngSize(await readFile(await selectionDownload.path()))
  expect(part.width).toBeLessThan(whole.width / 3)

  await page.getByRole('button', { name: 'Dışa aktar' }).first().click()
  await dialog.getByRole('radio', { name: 'SVG' }).click()
  const [svgDownload] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('export-download').click()])
  const svg = await readFile(await svgDownload.path(), 'utf8')
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
})
