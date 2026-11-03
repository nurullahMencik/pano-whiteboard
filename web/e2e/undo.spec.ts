import { expect, test } from '@playwright/test'
import { createBoard, drag, elements, openBoard, openUser, pickTool, waitConnected } from './helpers'

test('undo/redo only affects the local user’s own changes', async ({ browser }) => {
  const ayse = await openUser(browser, 'Ayşe')
  const burak = await openUser(browser, 'Burak')
  const path = await createBoard(ayse.page)
  await openBoard(ayse.page, path, 'Ayşe')
  await openBoard(burak.page, path, 'Burak')
  await waitConnected(ayse.page)
  await waitConnected(burak.page)

  await pickTool(ayse.page, 'rect')
  await drag(ayse.page, [450, 300], [610, 400])
  await expect.poll(async () => (await elements(burak.page)).length).toBe(1)

  // Burak draws after Ayşe, so his shape is the most recent change on the board.
  await pickTool(burak.page, 'diamond')
  await drag(burak.page, [700, 300], [860, 420])
  await expect.poll(async () => (await elements(ayse.page)).length).toBe(2)

  // Ayşe moves her rectangle, then undoes twice: the move, then the creation.
  await ayse.page.mouse.click(1000, 700)
  await drag(ayse.page, [452, 350], [502, 380])
  await ayse.page.keyboard.press('Control+z')
  await ayse.page.keyboard.press('Control+z')
  await expect.poll(async () => (await elements(ayse.page)).map((el) => el.type)).toEqual(['diamond'])
  await expect.poll(async () => (await elements(burak.page)).map((el) => el.type)).toEqual(['diamond'])

  // Redo brings back her rectangle; the toolbar undo button works too.
  await ayse.page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await elements(burak.page)).map((el) => el.type).sort()).toEqual(['diamond', 'rect'])
  await ayse.page.getByTestId('undo').click()
  await expect.poll(async () => (await elements(burak.page)).map((el) => el.type)).toEqual(['diamond'])

  await ayse.context.close()
  await burak.context.close()
})
