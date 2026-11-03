import { expect, test } from '@playwright/test'
import { createBoard, drag, elements, openBoard, openUser, pickTool, status, waitConnected } from './helpers'

test('a shape drawn while offline reaches the other user after reconnecting', async ({ browser }) => {
  const ayse = await openUser(browser, 'Ayşe')
  const burak = await openUser(browser, 'Burak')
  const path = await createBoard(ayse.page)
  await openBoard(ayse.page, path, 'Ayşe')
  await openBoard(burak.page, path, 'Burak')
  await waitConnected(ayse.page)
  await waitConnected(burak.page)

  await burak.context.setOffline(true)
  await expect.poll(() => status(burak.page)).toBe('offline')
  await expect(burak.page.getByTestId('connection-status')).toHaveAttribute('data-status', 'offline')

  // Burak keeps working offline; the change is stored locally.
  await pickTool(burak.page, 'ellipse')
  await drag(burak.page, [600, 400], [760, 520])
  expect((await elements(burak.page)).map((el) => el.type)).toEqual(['ellipse'])
  // Meanwhile Ayşe edits too.
  await pickTool(ayse.page, 'rect')
  await drag(ayse.page, [900, 300], [1020, 380])

  await ayse.page.waitForTimeout(800)
  expect((await elements(ayse.page)).map((el) => el.type)).toEqual(['rect'])

  // Back online: both edits merge on both sides without conflicts.
  await burak.context.setOffline(false)
  await waitConnected(burak.page)
  await expect.poll(async () => (await elements(ayse.page)).map((el) => el.type).sort()).toEqual(['ellipse', 'rect'])
  await expect.poll(async () => (await elements(burak.page)).map((el) => el.type).sort()).toEqual(['ellipse', 'rect'])

  await ayse.context.close()
  await burak.context.close()
})

test('server unreachable: waking notice, local drawing survives a reload and syncs once the server is reachable', async ({ browser }) => {
  const ayse = await openUser(browser, 'Ayşe')
  // Simulate a sleeping server: health checks hang up and WebSocket upgrades are refused...
  let serverAwake = false
  await ayse.context.routeWebSocket(/:5312\//, (ws) => {
    if (serverAwake) ws.connectToServer()
    else ws.close({ code: 1006 })
  })
  await ayse.context.route(/:5312\/health/, (route) => (serverAwake ? route.continue() : route.abort('connectionrefused')))
  const path = await createBoard(ayse.page)
  await expect(ayse.page.getByTestId('waking-notice')).toBeVisible({ timeout: 10_000 })
  await expect(ayse.page.getByTestId('waking-notice')).toContainText('Sunucu uyanıyor')
  expect(await status(ayse.page)).toBe('waking')

  // ...but the board is fully usable meanwhile, and persisted locally.
  await pickTool(ayse.page, 'rect')
  await drag(ayse.page, [600, 300], [760, 420])
  await ayse.page.waitForTimeout(300)
  await ayse.page.reload()
  await expect.poll(async () => (await elements(ayse.page)).length).toBe(1)
  expect(new URL(ayse.page.url()).pathname).toBe(path)

  // The server "wakes up": the next health ping reconnects and the local work syncs.
  serverAwake = true
  await waitConnected(ayse.page)
  await expect(ayse.page.getByTestId('waking-notice')).toBeHidden()
  const burak = await openUser(browser, 'Burak')
  await openBoard(burak.page, path, 'Burak')
  await expect.poll(async () => (await elements(burak.page)).map((el) => el.type)).toEqual(['rect'])
  await ayse.context.close()
  await burak.context.close()
})
