import { expect, test } from '@playwright/test'
import { elements, waitForBoard } from './helpers'

test('home page: templates seed new boards and boards appear in the recent list', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Birlikte düşünmek için sonsuz bir tahta')
  await expect(page.getByText('Henüz bir tahta açmadın.', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: /^Retro/ }).click()
  await waitForBoard(page)
  await expect.poll(async () => (await elements(page)).filter((el) => el.type === 'sticky').length).toBe(3)
  await expect(page.getByRole('textbox', { name: 'Tahta adı' })).toHaveValue('Retro')

  // Language switch is instant and persisted.
  await page.getByRole('button', { name: 'Dil: EN' }).click()
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('An infinite board for thinking together')
  await expect(page.getByRole('heading', { name: 'Recent boards' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Retro/ })).toBeVisible()

  // Keyboard help opens with "?".
  await page.getByRole('link', { name: /Retro/ }).click()
  await waitForBoard(page)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  expect(errors).toEqual([])
})
