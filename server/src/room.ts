import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import type { WebSocket } from 'ws'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import type { ServerConfig } from './config.js'
import { TokenBucket } from './limits.js'
import type { Logger } from './logger.js'
import type { Persistence } from './persistence.js'
import {
  MESSAGE_AUTH,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
  encodeMessage,
  isEmptyUpdate,
  readAwarenessClients,
} from './protocol.js'
import { logKey } from './rooms.js'

/** WebSocket close codes. 4400-4499 tell y-websocket not to reconnect. */
export const CLOSE = {
  invalidData: 1007,
  policy: 1008,
  tooLarge: 1009,
  roomFull: 4413,
} as const

const MAX_AWARENESS_BYTES = 32 * 1024
const MAX_CLIENT_IDS_PER_CONNECTION = 4

export interface Connection {
  readonly id: number
  readonly ws: WebSocket
  readonly ip: string
  readonly readOnly: boolean
  readonly controlledIds: Set<number>
  readonly messages: TokenBucket
  readonly bytes: TokenBucket
  rejectedWrites: number
  alive: boolean
}

export interface RoomStats {
  updatesApplied: number
  rejectedWrites: number
}

export class Room {
  readonly doc = new Y.Doc({ gc: true })
  readonly awareness: awarenessProtocol.Awareness
  readonly conns = new Map<WebSocket, Connection>()
  readonly stats: RoomStats = { updatesApplied: 0, rejectedWrites: 0 }
  private approxSize = 0
  private dirty = false
  private saveTimer: NodeJS.Timeout | null = null
  private firstDirtyAt = 0
  private idleTimer: NodeJS.Timeout | null = null
  private destroyed = false
  private readonly log: Logger

  constructor(
    readonly key: string,
    private readonly persistence: Persistence,
    private readonly config: ServerConfig,
    logger: Logger,
    private readonly onIdle: (room: Room) => void,
  ) {
    this.log = logger.child({ room: logKey(key) })
    const stored = persistence.load(key)
    if (stored) {
      Y.applyUpdate(this.doc, stored, 'persistence')
      this.approxSize = stored.byteLength
    }
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.awareness.setLocalState(null)

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'persistence') return
      this.approxSize += update.byteLength
      this.markDirty()
      const message = encodeMessage(MESSAGE_SYNC, (encoder) => syncProtocol.writeUpdate(encoder, update))
      for (const conn of this.conns.values()) {
        if (conn !== origin) this.send(conn, message)
      }
    })

    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        const changed = added.concat(updated, removed)
        const message = encodeMessage(MESSAGE_AWARENESS, (encoder) =>
          encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)),
        )
        // Sent to everyone, including the author: y-websocket uses the echo as a keep-alive.
        for (const conn of this.conns.values()) this.send(conn, message)
      },
    )
    this.log.debug('room.loaded', { bytes: this.approxSize })
  }

  get size(): number {
    return this.approxSize
  }

  addConnection(conn: Connection): void {
    this.cancelIdle()
    this.conns.set(conn.ws, conn)
    // Server initiates: send our state vector so the client answers with what we miss.
    this.send(conn, encodeMessage(MESSAGE_SYNC, (encoder) => syncProtocol.writeSyncStep1(encoder, this.doc)))
    const states = this.awareness.getStates()
    if (states.size > 0) {
      this.send(
        conn,
        encodeMessage(MESSAGE_AWARENESS, (encoder) =>
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys())),
          ),
        ),
      )
    }
  }

  removeConnection(conn: Connection): void {
    if (!this.conns.delete(conn.ws)) return
    if (conn.controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(conn.controlledIds), null)
    }
    if (this.conns.size === 0) this.scheduleIdle()
  }

  /** Handles one binary frame. Returns a close code when the connection must be dropped. */
  handleMessage(conn: Connection, data: Uint8Array): { code: number; reason: string } | null {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    switch (type) {
      case MESSAGE_SYNC:
        return this.handleSync(conn, decoder)
      case MESSAGE_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder)
        if (update.byteLength > MAX_AWARENESS_BYTES) {
          this.log.warn('awareness.too_large', { conn: conn.id, bytes: update.byteLength })
          return null
        }
        const clients = readAwarenessClients(update)
        for (const clientId of clients) {
          if (!this.claimClientId(conn, clientId)) {
            this.log.warn('awareness.spoof_rejected', { conn: conn.id, clientId })
            return null
          }
        }
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, conn)
        return null
      }
      case MESSAGE_QUERY_AWARENESS: {
        const ids = Array.from(this.awareness.getStates().keys())
        this.send(
          conn,
          encodeMessage(MESSAGE_AWARENESS, (encoder) =>
            encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids)),
          ),
        )
        return null
      }
      case MESSAGE_AUTH:
        return null
      default:
        return { code: CLOSE.invalidData, reason: 'unknown message type' }
    }
  }

  private handleSync(conn: Connection, decoder: decoding.Decoder): { code: number; reason: string } | null {
    const syncType = decoding.readVarUint(decoder)
    if (syncType === SYNC_STEP1) {
      const reply = encoding.createEncoder()
      encoding.writeVarUint(reply, MESSAGE_SYNC)
      syncProtocol.readSyncStep1(decoder, reply, this.doc)
      this.send(conn, encoding.toUint8Array(reply))
      return null
    }
    if (syncType !== SYNC_STEP2 && syncType !== SYNC_UPDATE) {
      return { code: CLOSE.invalidData, reason: 'unknown sync message' }
    }
    const update = decoding.readVarUint8Array(decoder)
    if (isEmptyUpdate(update)) return null
    if (conn.readOnly) {
      conn.rejectedWrites++
      this.stats.rejectedWrites++
      this.log.warn('write.rejected_read_only', { conn: conn.id, bytes: update.byteLength })
      return null
    }
    if (this.approxSize + update.byteLength > this.config.maxDocBytes) {
      this.log.warn('room.too_large', { conn: conn.id, bytes: this.approxSize })
      return { code: CLOSE.roomFull, reason: 'room is full' }
    }
    try {
      Y.applyUpdate(this.doc, update, conn)
      this.stats.updatesApplied++
    } catch (err) {
      this.log.warn('update.invalid', { conn: conn.id, err })
      return { code: CLOSE.invalidData, reason: 'invalid update' }
    }
    return null
  }

  /**
   * A connection may only speak for client ids that no other connection owns.
   * Exception: a client reconnecting from the same IP takes its id over from
   * its own stale socket (which may linger until the heartbeat notices), so
   * presence survives network drops and the stale socket's close cannot wipe it.
   */
  private claimClientId(conn: Connection, clientId: number): boolean {
    if (conn.controlledIds.has(clientId)) return true
    if (conn.controlledIds.size >= MAX_CLIENT_IDS_PER_CONNECTION) return false
    for (const other of this.conns.values()) {
      if (other === conn || !other.controlledIds.has(clientId)) continue
      if (other.ip !== conn.ip) return false
      other.controlledIds.delete(clientId)
      this.log.info('awareness.takeover', { from: other.id, to: conn.id })
    }
    conn.controlledIds.add(clientId)
    return true
  }

  private send(conn: Connection, message: Uint8Array): void {
    if (conn.ws.readyState !== conn.ws.OPEN) return
    conn.ws.send(message, (err) => {
      if (err) conn.ws.terminate()
    })
  }

  private markDirty(): void {
    if (!this.dirty) this.firstDirtyAt = Date.now()
    this.dirty = true
    if (this.saveTimer) clearTimeout(this.saveTimer)
    // Debounce, but never postpone a save for longer than 5x the debounce window.
    const maxWait = this.config.persistDebounceMs * 5
    const delay = Math.max(0, Math.min(this.config.persistDebounceMs, this.firstDirtyAt + maxWait - Date.now()))
    this.saveTimer = setTimeout(() => this.persist(), delay)
  }

  persist(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (!this.dirty || this.destroyed) return
    this.dirty = false
    try {
      const state = Y.encodeStateAsUpdate(this.doc)
      this.persistence.save(this.key, state)
      this.approxSize = state.byteLength
      this.log.debug('room.persisted', { bytes: state.byteLength })
    } catch (err) {
      this.dirty = true
      this.log.error('room.persist_failed', { err })
    }
  }

  private scheduleIdle(): void {
    this.cancelIdle()
    this.idleTimer = setTimeout(() => {
      if (this.conns.size === 0) this.onIdle(this)
    }, this.config.roomIdleMs)
  }

  private cancelIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  destroy(): void {
    this.persist()
    this.cancelIdle()
    this.destroyed = true
    this.awareness.destroy()
    this.doc.destroy()
  }
}
