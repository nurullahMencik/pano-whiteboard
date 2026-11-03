import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { elements, waitConnected, waitForBoard } from './helpers'

const DOCS = resolve(import.meta.dirname, '../../docs')
const SHOTS = resolve(DOCS, 'screenshots')

const USERS = {
  nurullah: { name: 'Nurullah', color: '#c2410c' },
  elif: { name: 'Elif', color: '#1971c2' },
  mert: { name: 'Mert', color: '#237032' },
  ayse: { name: 'Ayşe', color: '#6741d9' },
}

const boardUrl = (path: string, user: { name: string; color: string }, extra = '') =>
  `${path}?name=${encodeURIComponent(user.name)}&color=${encodeURIComponent(user.color)}${extra}`

const join = async (browser: Browser, path: string, user: { name: string; color: string }, options: Parameters<Browser['newContext']>[0] = {}) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, ...options })
  const page = await context.newPage()
  await page.goto(boardUrl(path, user))
  await waitForBoard(page)
  await waitConnected(page)
  return page
}

const screen = (page: Page, world: { x: number; y: number }) =>
  page.evaluate((p) => window.__PANO__?.worldToScreen(p) ?? { x: 0, y: 0 }, world)

const elementCentre = async (page: Page, predicate: (el: Awaited<ReturnType<typeof elements>>[number]) => boolean) => {
  const el = (await elements(page)).find(predicate)
  if (!el) throw new Error('element not found')
  return screen(page, { x: el.x + el.w / 2, y: el.y + el.h / 2 })
}

/** Moves the mouse in small steps so the remote cursor glides there. */
const glide = async (page: Page, x: number, y: number) => {
  await page.mouse.move(x, y, { steps: 12 })
}

test('README screenshots with several real collaborators', async ({ browser }) => {
  await mkdir(SHOTS, { recursive: true })
  const ownerContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const nurullah = await ownerContext.newPage()
  await nurullah.goto('./')
  await nurullah.getByRole('button', { name: 'Demo tahtayı aç' }).click()
  await waitForBoard(nurullah)
  const path = new URL(nurullah.url()).pathname
  await nurullah.goto(boardUrl(path, USERS.nurullah))
  await waitForBoard(nurullah)
  await waitConnected(nurullah)
  await expect.poll(async () => (await elements(nurullah)).length).toBeGreaterThan(30)

  const elif = await join(browser, path, USERS.elif)
  const mert = await join(browser, path, USERS.mert)

  // Elif selects the "customer demo" note, Mert is in the middle of a freehand stroke.
  const note = await elementCentre(elif, (el) => el.type === 'sticky' && (el.text ?? '').startsWith('Müşteri'))
  await elif.mouse.click(note.x, note.y)
  await glide(elif, note.x + 70, note.y + 40)

  // Mert underlines "Ready to ship" with a green marker, mid-stroke when the shot is taken.
  await mert.keyboard.press('p')
  await mert.getByRole('radio', { name: 'Yeşil' }).click()
  await mert.getByRole('radio', { name: 'Orta' }).click()
  const ship = await elementCentre(mert, (el) => el.type === 'text' && (el.text ?? '').startsWith('Yayına'))
  await mert.mouse.move(ship.x - 70, ship.y + 26)
  await mert.mouse.down()
  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    await mert.mouse.move(ship.x - 70 + t * 150, ship.y + 26 + Math.sin(t * Math.PI * 3) * 4 - t * 4)
  }

  await nurullah.mouse.move(1500, 960)
  await nurullah.waitForTimeout(900)
  await nurullah.screenshot({ path: resolve(SHOTS, '01-hero.png') })
  await mert.mouse.up()

  // 02: Elif (dark theme) follows Nurullah, who zooms into the release flow.
  await elif.getByRole('button', { name: /^Tema/ }).click()
  await elif.getByRole('button', { name: /^Tema/ }).click()
  await expect(elif.locator('html')).toHaveClass(/dark/)
  await elif.keyboard.press('Escape')
  await elif.getByTestId('people-button').click()
  await elif.getByRole('listitem').filter({ hasText: 'Nurullah' }).getByRole('button', { name: 'Takip et' }).click()
  const target = await elementCentre(nurullah, (el) => el.type === 'diamond')
  await nurullah.mouse.move(target.x, target.y)
  await nurullah.keyboard.down('Control')
  for (let i = 0; i < 2; i++) await nurullah.mouse.wheel(0, -45)
  await nurullah.keyboard.up('Control')
  const fix = await elementCentre(mert, (el) => el.type === 'rect' && el.text === 'Düzelt')
  await glide(mert, fix.x - 20, fix.y + 10)
  const decision = await elementCentre(nurullah, (el) => el.type === 'diamond')
  await glide(nurullah, decision.x + 30, decision.y + 20)
  await elif.waitForTimeout(1200)
  await elif.getByTestId('people-button').click()
  await elif.waitForTimeout(300)
  await elif.screenshot({ path: resolve(SHOTS, '02-follow-dark.png') })
  await elif.keyboard.press('Escape')

  // 03: close-up while editing — Nurullah's selection + style panel, Elif typing a new note, Mert pointing.
  await nurullah.evaluate(() => window.__PANO__?.setCamera({ x: 40, y: -250, zoom: 1 }))
  await elif.keyboard.press('Shift+Digit1')
  await elif.waitForTimeout(300)
  const improve = await elementCentre(nurullah, (el) => el.type === 'sticky' && (el.text ?? '').startsWith('Mobil'))
  await nurullah.mouse.click(improve.x, improve.y)
  await elif.keyboard.press('s')
  const spot = await screen(elif, { x: 560, y: 340 })
  await elif.mouse.click(spot.x, spot.y)
  await elif.keyboard.type('Changelog otomasyonu', { delay: 15 })
  const rest = await screen(elif, { x: 690, y: 470 })
  await glide(elif, rest.x, rest.y)
  const action = await elementCentre(mert, (el) => el.type === 'sticky' && (el.text ?? '').startsWith('Playwright'))
  await glide(mert, action.x + 30, action.y + 20)
  await nurullah.mouse.move(1590, 990)
  await nurullah.waitForTimeout(900)
  await nurullah.screenshot({ path: resolve(SHOTS, '03-editing.png') })
  await elif.keyboard.press('Escape')
  await nurullah.keyboard.press('Escape')

  // 04: phone view of the same board while the others keep working.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const ayse = await phone.newPage()
  await ayse.goto(boardUrl(path, USERS.ayse))
  await waitForBoard(ayse)
  await waitConnected(ayse)
  await ayse.evaluate(() => window.__PANO__?.setCamera({ x: -16, y: -330, zoom: 0.52 }))
  const good = await elementCentre(nurullah, (el) => el.type === 'sticky' && (el.text ?? '').startsWith('Tasarım'))
  await nurullah.mouse.click(good.x, good.y)
  await glide(nurullah, good.x + 40, good.y + 60)
  const sticky = await elementCentre(mert, (el) => el.type === 'sticky' && (el.text ?? '').startsWith('Playwright'))
  await glide(mert, sticky.x + 20, sticky.y + 30)
  await ayse.waitForTimeout(1000)
  await ayse.screenshot({ path: resolve(SHOTS, '04-mobile.png') })

  await phone.close()
  await ownerContext.close()
})

test('side-by-side sync video', async ({ browser }) => {
  const setup = await browser.newContext()
  const owner = await setup.newPage()
  await owner.goto('./')
  await owner.getByRole('button', { name: 'Yeni tahta oluştur' }).click()
  await waitForBoard(owner)
  const path = new URL(owner.url()).pathname
  await setup.close()

  const width = 1600
  const height = 900
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: { dir: resolve(DOCS, '.video'), size: { width, height } },
  })
  const page = await context.newPage()
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:5311/').origin
  const src = (user: { name: string; color: string }) => `${origin}${boardUrl(path, user, '&lang=tr')}`
  await page.setContent(`<!doctype html><html><body style="margin:0;display:flex;gap:6px;background:#1b1f2a">
    <iframe id="left" src="${src(USERS.nurullah)}" style="width:797px;height:${height}px;border:0"></iframe>
    <iframe id="right" src="${src(USERS.elif)}" style="width:797px;height:${height}px;border:0"></iframe>
  </body></html>`)
  const left = page.frameLocator('#left')
  const right = page.frameLocator('#right')
  await expect(left.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', { timeout: 15_000 })
  await expect(right.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', { timeout: 15_000 })
  await page.waitForTimeout(600)

  const R = 803 // x offset of the right frame
  // Same camera in both windows so positions line up (content stays right of the style panel).
  for (const frame of page.frames().slice(1)) await frame.evaluate(() => window.__PANO__?.setCamera({ x: 0, y: 0, zoom: 1 }))
  await page.waitForTimeout(300)

  // Left (Nurullah): a sticky note with text.
  await left.locator('[data-tool="sticky"]:visible').click()
  await page.mouse.move(540, 320, { steps: 10 })
  await page.mouse.click(540, 320)
  await page.keyboard.type('Lansman Cuma!', { delay: 70 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // Right (Elif): circles it with the pen.
  await right.locator('[data-tool="freedraw"]:visible').click()
  await right.getByRole('radio', { name: 'Kırmızı' }).click()
  await right.getByRole('radio', { name: 'Orta' }).click()
  await page.mouse.move(R + 540, 170, { steps: 8 })
  await page.mouse.down()
  for (let i = 0; i <= 50; i++) {
    const t = -Math.PI / 2 + (i / 50) * Math.PI * 2.1
    await page.mouse.move(R + 540 + Math.cos(t) * 160, 320 + Math.sin(t) * 150)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)

  // Right: an arrow and a decision shape.
  await right.locator('[data-tool="arrow"]:visible').click()
  await page.mouse.move(R + 560, 490, { steps: 6 })
  await page.mouse.down()
  await page.mouse.move(R + 620, 600, { steps: 14 })
  await page.mouse.up()
  await right.locator('[data-tool="diamond"]:visible').click()
  await right.getByRole('radio', { name: 'Açık Sarı' }).click()
  await right.getByRole('radio', { name: 'Hardal' }).or(right.getByRole('radio', { name: 'Sarı' })).first().click()
  await page.mouse.move(R + 520, 610, { steps: 6 })
  await page.mouse.down()
  await page.mouse.move(R + 720, 730, { steps: 14 })
  await page.mouse.up()
  await page.mouse.click(R + 760, 450)
  await page.waitForTimeout(400)

  // Left: drags the note; Elif sees it slide live.
  await left.locator('[data-tool="select"]:visible').click()
  await page.mouse.move(540, 300, { steps: 6 })
  await page.mouse.down()
  await page.mouse.move(420, 520, { steps: 30 })
  await page.mouse.up()
  await page.mouse.click(760, 800)
  await page.waitForTimeout(500)

  // Left: undo only reverts Nurullah's own move; Elif's drawings stay.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(1500)
  await context.close()
  const video = page.video()
  if (video) await copyFile(await video.path(), resolve(DOCS, 'demo.webm'))
})
