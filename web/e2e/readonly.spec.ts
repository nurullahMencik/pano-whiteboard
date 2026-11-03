import { expect, test } from '@playwright/test'
import { createBoard, drag, elements, openUser, pickTool, waitConnected, waitForBoard } from './helpers'

test('read-only link: viewer watches live but cannot edit', async ({ browser }) => {
  const owner = await openUser(browser, 'Ayşe', { permissions: ['clipboard-read', 'clipboard-write'] })
  await createBoard(owner.page)
  await waitConnected(owner.page)
  await pickTool(owner.page, 'rect')
  await drag(owner.page, [400, 300], [560, 400])

  await owner.page.getByRole('button', { name: 'Paylaş' }).click()
  const dialog = owner.page.getByRole('dialog', { name: 'Tahtayı paylaş' })
  await expect(dialog.getByTestId('share-qr').locator('svg')).toBeVisible()
  await dialog.getByTestId('share-readonly').click()
  const viewUrl = await dialog.getByRole('textbox').inputValue()
  expect(viewUrl).toMatch(/\/v\/[A-Za-z0-9_-]{43}$/)
  expect(viewUrl).not.toContain(new URL(owner.page.url()).pathname.split('/').pop() ?? '-')

  const viewer = await openUser(browser, 'Viewer')
  await viewer.page.goto(viewUrl)
  await waitForBoard(viewer.page)
  await waitConnected(viewer.page)
  await expect.poll(async () => (await elements(viewer.page)).length).toBe(1)
  await expect(viewer.page.getByText('Salt okunur').first()).toBeVisible()
  await expect(viewer.page.getByRole('toolbar', { name: 'Çizim araçları' })).toHaveCount(0)

  // Keyboard shortcuts cannot switch to a drawing tool, and dragging only pans.
  await viewer.page.keyboard.press('r')
  await drag(viewer.page, [300, 600], [500, 700])
  await viewer.page.keyboard.press('Delete')
  expect((await elements(viewer.page)).length).toBe(1)

  // Owner edits keep streaming to the viewer.
  await owner.page.keyboard.press('Escape')
  await pickTool(owner.page, 'ellipse')
  await drag(owner.page, [700, 300], [820, 400])
  await expect.poll(async () => (await elements(viewer.page)).length).toBe(2)
  await owner.context.close()
  await viewer.context.close()
})
