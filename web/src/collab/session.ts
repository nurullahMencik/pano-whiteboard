import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { BoardModel, LOCAL_ORIGIN, SEED_ORIGIN } from '../lib/model'
import type { SeedContent } from '../lib/templates'
import type { PresenceState, UserInfo } from '../lib/types'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'waking' | 'offline' | 'local'

export interface SessionOptions {
  /** `r/<roomId>` for editors, `v/<viewId>` for read-only viewers. */
  roomName: string
  readOnly: boolean
  user: UserInfo
  /** WebSocket base URL, or null for a purely local board. */
  wsUrl: string | null
}

export interface ConnectionInfo {
  status: ConnectionStatus
  /** When the current "waking" phase started (ms epoch), for the countdown. */
  wakingSince: number | null
  /** True once the first server sync completed in this session. */
  everSynced: boolean
}

const WAKING_AFTER_MS = 3500
const HEALTH_INTERVAL_MS = 4000

export const healthUrlFor = (wsUrl: string) => wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '') + '/health'

/**
 * Owns everything that is per-board and not UI: the Y.Doc, local persistence
 * (IndexedDB), the WebSocket provider, awareness and the per-user undo manager.
 */
export class BoardSession {
  readonly doc = new Y.Doc()
  readonly model: BoardModel
  readonly undo: Y.UndoManager
  readonly awareness: Awareness
  readonly provider: WebsocketProvider | null
  readonly local: IndexeddbPersistence
  readonly localReady: Promise<void>
  readonly readOnly: boolean
  readonly roomName: string
  private info: ConnectionInfo
  private readonly listeners = new Set<(info: ConnectionInfo) => void>()
  private wakingTimer: ReturnType<typeof setTimeout> | null = null
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private destroyed = false
  private readonly healthUrl: string | null

  constructor(options: SessionOptions) {
    this.readOnly = options.readOnly
    this.roomName = options.roomName
    this.model = new BoardModel(this.doc)
    this.undo = new Y.UndoManager([this.model.elements, this.model.assets], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 500,
    })
    this.local = new IndexeddbPersistence(`pano:${options.roomName}`, this.doc)
    this.localReady = this.local.whenSynced.then(() => undefined)
    this.healthUrl = options.wsUrl ? healthUrlFor(options.wsUrl) : null

    if (options.wsUrl) {
      this.provider = new WebsocketProvider(options.wsUrl, options.roomName, this.doc, {
        connect: navigator.onLine,
        maxBackoffTime: 5000,
      })
      this.awareness = this.provider.awareness
      this.info = { status: navigator.onLine ? 'connecting' : 'offline', wakingSince: null, everSynced: false }
      this.provider.on('status', ({ status }) => {
        if (status === 'connected') this.clearWaking()
        if (status === 'disconnected' && this.info.status === 'connected') this.set({ status: 'reconnecting' })
        if (status === 'disconnected' || status === 'connecting') this.armWaking()
      })
      this.provider.on('sync', (synced) => {
        if (synced) {
          this.clearWaking()
          this.set({ status: 'connected', wakingSince: null, everSynced: true })
        }
      })
      this.armWaking()
    } else {
      this.provider = null
      this.awareness = new Awareness(this.doc)
      this.info = { status: 'local', wakingSince: null, everSynced: false }
    }

    const state: PresenceState = {
      user: options.user,
      cursor: null,
      selection: [],
      viewport: null,
      readOnly: options.readOnly,
      editing: null,
    }
    this.awareness.setLocalState(state)

    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
  }

  get connection(): ConnectionInfo {
    return this.info
  }

  onConnection(listener: (info: ConnectionInfo) => void): () => void {
    this.listeners.add(listener)
    listener(this.info)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<ConnectionInfo>) {
    const next = { ...this.info, ...patch }
    if (next.status === this.info.status && next.wakingSince === this.info.wakingSince && next.everSynced === this.info.everSynced) return
    this.info = next
    for (const listener of this.listeners) listener(next)
  }

  /** If no sync happens soon, assume the (free tier) server is asleep and start waking it. */
  private armWaking() {
    if (this.destroyed || !this.provider || this.wakingTimer || this.info.status === 'offline') return
    this.wakingTimer = setTimeout(() => {
      this.wakingTimer = null
      if (this.provider?.synced || this.info.status === 'offline') return
      this.set({ status: this.info.everSynced ? 'reconnecting' : 'waking', wakingSince: this.info.wakingSince ?? Date.now() })
      this.startHealthPings()
    }, WAKING_AFTER_MS)
  }

  private clearWaking() {
    if (this.wakingTimer) clearTimeout(this.wakingTimer)
    this.wakingTimer = null
    if (this.healthTimer) clearInterval(this.healthTimer)
    this.healthTimer = null
  }

  private startHealthPings() {
    if (this.healthTimer || !this.healthUrl) return
    const ping = async () => {
      if (!this.healthUrl || this.destroyed || this.provider?.synced) return
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const res = await fetch(this.healthUrl, { cache: 'no-store', signal: controller.signal })
        if (res.ok && this.provider && !this.provider.wsconnected) this.retryNow()
      } catch {
        // Still asleep or unreachable; keep pinging.
      } finally {
        clearTimeout(timeout)
      }
    }
    void ping()
    this.healthTimer = setInterval(() => void ping(), HEALTH_INTERVAL_MS)
  }

  /** Reconnect immediately (skips the provider's exponential backoff). */
  retryNow() {
    if (!this.provider || this.destroyed || !navigator.onLine) return
    this.provider.disconnect()
    this.provider.connect()
  }

  private readonly handleOffline = () => {
    this.clearWaking()
    this.provider?.disconnect()
    if (this.provider) this.set({ status: 'offline' })
  }

  private readonly handleOnline = () => {
    if (!this.provider) return
    this.set({ status: this.info.everSynced ? 'reconnecting' : 'connecting' })
    this.provider.connect()
    this.armWaking()
  }

  setPresence(patch: Partial<PresenceState>) {
    const current = this.awareness.getLocalState() as PresenceState | null
    if (!current) return
    this.awareness.setLocalState({ ...current, ...patch })
  }

  /** Groups everything until `endBatch` into one undo step (used for drags). */
  beginBatch() {
    this.undo.stopCapturing()
    this.undo.captureTimeout = Number.MAX_SAFE_INTEGER
  }

  endBatch() {
    this.undo.captureTimeout = 500
    this.undo.stopCapturing()
  }

  /** Seeds a freshly created board with a template (not undoable, applied once). */
  seed(content: SeedContent, title: string) {
    if (this.model.meta.get('seeded') === true || this.model.elements.size > 0) return
    this.doc.transact(() => {
      for (const [id, url] of Object.entries(content.assets ?? {})) this.model.assets.set(id, url)
      this.model.addMany(content.elements, SEED_ORIGIN)
      this.model.meta.set('seeded', true)
      if (title && !this.model.meta.get('title')) this.model.meta.set('title', title)
      this.model.meta.set('createdAt', Date.now())
    }, SEED_ORIGIN)
  }

  destroy() {
    this.destroyed = true
    this.clearWaking()
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    this.awareness.setLocalState(null)
    this.provider?.destroy()
    void this.local.destroy()
    this.undo.destroy()
    this.doc.destroy()
    this.listeners.clear()
  }
}
