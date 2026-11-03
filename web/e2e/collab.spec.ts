import { expect, test } from '@playwright/test'
import { canvasPixel, createBoard, drag, elements, openBoard, openUser, pickTool, waitConnected } from './helpers'

test('two browser contexts share a board: shapes, cursors and presence sync live', async ({ browser }) => {
  const ayse = await openUser(browser, 'Ayşe')
  const burak = await openUser(browser, 'Burak')
  const path = await createBoard(ayse.page)
  await openBoard(ayse.page, path, 'Ayşe')
  await openBoard(burak.page, path, 'Burak')
  await waitConnected(ayse.page)
  await waitConnected(burak.page)

  // Ayşe draws a filled rectangle.
  await pickTool(ayse.page, 'rect')
  await ayse.page.getByRole('radio', { name: 'Açık Mavi' }).click()
  await drag(ayse.page, [500, 300], [700, 440])

  await expect.poll(async () => (await elements(burak.page)).map((el) => el.type)).toEqual(['rect'])
  const [rect] = await elements(burak.page)
  expect(rect.fill).toBe('#d0ebff')
  expect(rect.w).toBeGreaterThan(150)

  // The shape is actually painted on Burak's canvas (fill colour at its centre).
  const centre = await burak.page.evaluate(
    (r) => window.__PANO__?.worldToScreen({ x: r.x + r.w / 2, y: r.y + r.h / 2 }),
    rect,
  )
  expect(centre).toBeTruthy()
  await expect.poll(() => canvasPixel(burak.page, centre?.x ?? 0, centre?.y ?? 0)).toEqual([208, 235, 255])

  // Burak sees Ayşe's cursor with her name, and both appear in the presence list.
  await ayse.page.mouse.move(800, 500)
  await ayse.page.mouse.move(820, 520, { steps: 4 })
  const cursor = burak.page.locator('[data-testid="remote-cursor"][data-name="Ayşe"]')
  await expect(cursor).toBeVisible()
  await expect(burak.page.getByTestId('people-button')).toHaveAccessibleName(/2 kişi çevrimiçi/)

  // Live editing goes both ways: Burak adds a sticky note with text.
  await pickTool(burak.page, 'sticky')
  await burak.page.mouse.click(900, 600)
  await burak.page.keyboard.type('Merhaba Ayşe')
  await burak.page.keyboard.press('Escape')
  await expect.poll(async () => (await elements(ayse.page)).find((el) => el.type === 'sticky')?.text).toBe('Merhaba Ayşe')

  expect(ayse.errors).toEqual([])
  expect(burak.errors).toEqual([])
  await ayse.context.close()
  await burak.context.close()
})

test('follow mode tracks another user’s viewport', async ({ browser }) => {
  const ayse = await openUser(browser, 'Ayşe')
  const burak = await openUser(browser, 'Burak')
  const path = await createBoard(ayse.page, 'Demo tahtayı aç')
  await openBoard(ayse.page, path, 'Ayşe')
  await openBoard(burak.page, path, 'Burak')
  await waitConnected(ayse.page)
  await waitConnected(burak.page)

  // Burak follows Ayşe; when she zooms, his camera follows.
  await burak.page.getByTestId('people-button').click()
  await burak.page.getByRole('button', { name: 'Takip et' }).click()
  await expect(burak.page.getByText('Ayşe takip ediliyor')).toBeVisible()
  await ayse.page.mouse.move(700, 450)
  for (let i = 0; i < 6; i++) await ayse.page.mouse.wheel(0, -120)
  await ayse.page.keyboard.down('Control')
  for (let i = 0; i < 4; i++) await ayse.page.mouse.wheel(0, -100)
  await ayse.page.keyboard.up('Control')
  const ayseZoom = await ayse.page.evaluate(() => window.__PANO__?.camera().zoom ?? 0)
  await expect.poll(async () => Math.abs((await burak.page.evaluate(() => window.__PANO__?.camera().zoom ?? 0)) - ayseZoom), { timeout: 10_000 }).toBeLessThan(0.05)
  await burak.page.keyboard.press('Escape')
  await expect(burak.page.getByText('Ayşe takip ediliyor')).toBeHidden()

  await ayse.context.close()
  await burak.context.close()
})
