import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'

export interface PanoElement {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  text?: string
  fill: string
  stroke: string
}

type PanoHandle = {
  elements: () => PanoElement[]
  selection: () => string[]
  status: () => string
  worldToScreen: (p: { x: number; y: number }) => { x: number; y: number }
  peers: () => { name: string; isSelf: boolean }[]
  undoDepth: () => number
  camera: () => { x: number; y: number; zoom: number }
  setCamera: (cam: { x: number; y: number; zoom: number }) => void
  corners: (id: string) => { x: number; y: number }[] | null
}

declare global {
  interface Window {
    __PANO__?: PanoHandle
  }
}

export const elements = (page: Page) => page.evaluate(() => window.__PANO__?.elements() ?? [])
export const status = (page: Page) => page.evaluate(() => window.__PANO__?.status() ?? 'none')

export const openUser = async (browser: Browser, name: string, options: BrowserContextOptions = {}) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, ...options })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return { context, page, name, errors }
}

/** Creates a fresh board from the home page and returns its path. */
export const createBoard = async (page: Page, button = 'Yeni tahta oluştur') => {
  await page.goto('./')
  await page.getByRole('button', { name: button }).click()
  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]{22}$/)
  await waitForBoard(page)
  return new URL(page.url()).pathname
}

export const waitForBoard = async (page: Page) => {
  await expect(page.getByTestId('board')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(window.__PANO__))).toBe(true)
}

export const waitConnected = async (page: Page) => {
  await expect.poll(() => status(page), { timeout: 15_000 }).toBe('connected')
}

export const openBoard = async (page: Page, path: string, name: string) => {
  await page.goto(`${path}?name=${encodeURIComponent(name)}`)
  await waitForBoard(page)
}

export const drag = async (page: Page, from: [number, number], to: [number, number], steps = 10) => {
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  await page.mouse.move(to[0], to[1], { steps })
  await page.mouse.up()
}

export const pickTool = async (page: Page, tool: string) => {
  await page.locator(`[data-tool="${tool}"]:visible`).first().click()
}

/** Reads the canvas pixel under a screen point (device pixel ratio aware). */
export const canvasPixel = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector('[data-testid="board"] canvas') as HTMLCanvasElement
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const ratio = canvas.width / canvas.getBoundingClientRect().width
      const data = ctx.getImageData(Math.round(px * ratio), Math.round(py * ratio), 1, 1).data
      return [data[0], data[1], data[2]]
    },
    [x, y],
  )
