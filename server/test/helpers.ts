import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { loadConfig, type ServerConfig } from '../src/config.js'
import { createLogger } from '../src/logger.js'
import { SqlitePersistence } from '../src/persistence.js'
import { createPanoServer, type PanoServer } from '../src/server.js'

export const TEST_PORT = Number(process.env.TEST_PORT ?? 5312)
export const WS_URL = `ws://127.0.0.1:${TEST_PORT}`
export const HTTP_URL = `http://127.0.0.1:${TEST_PORT}`

export interface Harness {
  server: PanoServer
  persistence: SqlitePersistence
  config: ServerConfig
  stop(): Promise<void>
}

export const startServer = async (overrides: Partial<ServerConfig> = {}): Promise<Harness> => {
  const config: ServerConfig = {
    ...loadConfig({}),
    port: TEST_PORT,
    host: '127.0.0.1',
    dbPath: ':memory:',
    logLevel: 'silent',
    persistDebounceMs: 20,
    ...overrides,
  }
  const persistence = new SqlitePersistence(config.dbPath)
  const server = createPanoServer(config, persistence, createLogger(config.logLevel))
  await server.listen()
  return {
    server,
    persistence,
    config,
    stop: async () => {
      await server.close()
      persistence.close()
    },
  }
}

export const tempDbPath = (): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'pano-test-'))
  return { path: join(dir, 'pano.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** y-websocket provider over Node's `ws`; `ip` is sent as X-Forwarded-For (for TRUST_PROXY tests). */
export const connect = (roomName: string, doc = new Y.Doc(), ip?: string): WebsocketProvider => {
  class ForwardedWebSocket extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, ip ? { headers: { 'x-forwarded-for': ip } } : {})
    }
  }
  return new WebsocketProvider(WS_URL, roomName, doc, {
    WebSocketPolyfill: (ip ? ForwardedWebSocket : WebSocket) as unknown as typeof globalThis.WebSocket,
    disableBc: true,
  })
}

export const waitFor = async (predicate: () => boolean, timeoutMs = 5000, label = 'condition'): Promise<void> => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
}

export const synced = (provider: WebsocketProvider): Promise<void> =>
  waitFor(() => provider.synced, 5000, 'provider sync')

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Opens a raw socket and resolves with the close code (or the HTTP status on a failed upgrade). */
export const rawSocket = (path: string, headers: Record<string, string> = {}) => {
  const ws = new WebSocket(`${WS_URL}${path}`, { headers })
  const opened = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)))
    ws.once('error', reject)
  })
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))
  })
  return { ws, opened, closed }
}
