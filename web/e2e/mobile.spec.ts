import { expect, test } from '@playwright/test'
import { createBoard, elements } from './helpers'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

const noHorizontalScroll = async (page: import('@playwright/test').Page) => {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll).toBeLessThanOrEqual(client)
}

test('mobile: home page and board are usable with touch', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await noHorizontalScroll(page)

  await createBoard(page)
  await noHorizontalScroll(page)

  // Bottom toolbar is visible and every button is a comfortable touch target.
  const toolbar = page.getByRole('toolbar', { name: 'Çizim araçları' }).last()
  await expect(toolbar).toBeVisible()
  const box = await toolbar.boundingBox()
  expect(box?.y ?? 0).toBeGreaterThan(700)
  for (const button of await toolbar.getByRole('button').all()) {
    const b = await button.boundingBox()
    expect(b?.width ?? 0).toBeGreaterThanOrEqual(36)
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(36)
    expect((b?.x ?? 0) + (b?.width ?? 0)).toBeLessThanOrEqual(390)
  }

  // Tap the sticky tool, tap the canvas, type.
  await toolbar.locator('[data-tool="sticky"]').tap()
  await page.touchscreen.tap(195, 400)
  await expect(page.getByTestId('text-editor')).toBeFocused()
  await page.keyboard.type('Mobil not')
  await page.getByTestId('text-editor').blur()
  await expect.poll(async () => (await elements(page)).map((el) => [el.type, el.text])).toEqual([['sticky', 'Mobil not']])

  // The overflow menu exposes the secondary tools.
  await toolbar.getByRole('button', { name: 'Diğer araçlar' }).tap()
  await expect(page.getByRole('menu', { name: 'Diğer araçlar' }).locator('[data-tool="ellipse"]')).toBeVisible()
})
