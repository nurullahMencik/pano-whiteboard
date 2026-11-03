import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import type { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { viewIdFor } from '../src/rooms.js'
import {
  HTTP_URL,
  connect,
  delay,
  rawSocket,
  startServer,
  synced,
  tempDbPath,
  waitFor,
  type Harness,
} from './helpers.js'

const newRoomId = () => randomBytes(16).toString('base64url')

let harness: Harness | null = null
const providers: WebsocketProvider[] = []
const track = (provider: WebsocketProvider) => {
  providers.push(provider)
  return provider
}

afterEach(async () => {
  for (const provider of providers.splice(0)) provider.destroy()
  await harness?.stop()
  harness = null
})

describe('server integration (real WebSocket)', () => {
  it('exposes a health endpoint', async () => {
    harness = await startServer()
    const res = await fetch(`${HTTP_URL}/health`)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const body = (await res.json()) as { status: string; rooms: number }
    expect(body.status).toBe('ok')
    expect(body.rooms).toBe(0)
  })

  it('syncs two clients in the same room, both directions, including awareness', async () => {
    harness = await startServer()
    const roomId = newRoomId()
    const a = track(connect(`r/${roomId}`))
    const b = track(connect(`r/${roomId}`))
    await Promise.all([synced(a), synced(b)])

    a.doc.getMap('elements').set('rect-1', 'from-a')
    await waitFor(() => b.doc.getMap('elements').get('rect-1') === 'from-a', 5000, 'a -> b')

    b.doc.getMap('elements').set('note-1', 'from-b')
    await waitFor(() => a.doc.getMap('elements').get('note-1') === 'from-b', 5000, 'b -> a')

    a.awareness.setLocalStateField('user', { name: 'Ayşe' })
    await waitFor(
      () => (b.awareness.getStates().get(a.doc.clientID) as { user?: { name: string } } | undefined)?.user?.name === 'Ayşe',
      5000,
      'awareness a -> b',
    )
    expect(harness.server.rooms.size).toBe(1)
  })

  it('isolates rooms from each other', async () => {
    harness = await startServer()
    const a = track(connect(`r/${newRoomId()}`))
    const b = track(connect(`r/${newRoomId()}`))
    await Promise.all([synced(a), synced(b)])
    a.doc.getMap('elements').set('x', 1)
    await delay(200)
    expect(b.doc.getMap('elements').size).toBe(0)
  })

  it('serves read-only clients but rejects their writes', async () => {
    harness = await startServer()
    const roomId = newRoomId()
    const editor = track(connect(`r/${roomId}`))
    await synced(editor)
    editor.doc.getMap('elements').set('shared', 'visible')

    const viewer = track(connect(`v/${viewIdFor(roomId)}`))
    await synced(viewer)
    await waitFor(() => viewer.doc.getMap('elements').get('shared') === 'visible', 5000, 'viewer receives state')

    // The viewer mutates its local doc; the provider sends the update, the server must drop it.
    viewer.doc.getMap('elements').set('vandalism', 'nope')
    await waitFor(() => (harness?.server.rooms.values().next().value?.stats.rejectedWrites ?? 0) > 0, 5000, 'rejection')
    await delay(150)

    expect(editor.doc.getMap('elements').has('vandalism')).toBe(false)
    const room = harness.server.rooms.values().next().value
    expect(room?.doc.getMap('elements').has('vandalism')).toBe(false)
    expect(room?.doc.getMap('elements').get('shared')).toBe('visible')

    // Edits keep flowing to the viewer after the rejection.
    editor.doc.getMap('elements').set('later', 42)
    await waitFor(() => viewer.doc.getMap('elements').get('later') === 42, 5000, 'viewer keeps receiving')
  })

  it('a read-only link cannot be used as an edit link', async () => {
    harness = await startServer()
    const roomId = newRoomId()
    const editor = track(connect(`r/${roomId}`))
    await synced(editor)
    editor.doc.getMap('elements').set('a', 1)
    // Trying the view id as a room id lands in a different (empty) room.
    const attacker = track(connect(`r/${viewIdFor(roomId)}`))
    await synced(attacker)
    attacker.doc.getMap('elements').set('evil', 1)
    await delay(200)
    expect(attacker.doc.getMap('elements').has('a')).toBe(false)
    expect(editor.doc.getMap('elements').has('evil')).toBe(false)
  })

  it('rejects oversized messages with close code 1009', async () => {
    harness = await startServer({ maxMessageBytes: 64 * 1024 })
    const { ws, opened, closed } = rawSocket(`/r/${newRoomId()}`)
    await opened
    ws.send(Buffer.alloc(200 * 1024, 1))
    const result = await closed
    expect(result.code).toBe(1009)
  })

  it('rejects invalid room ids and foreign origins at the HTTP upgrade', async () => {
    harness = await startServer({ allowedOrigins: ['https://nurullahmencik.github.io'] })
    await expect(rawSocket('/r/short', { origin: 'https://nurullahmencik.github.io' }).opened).rejects.toThrow('HTTP 400')
    await expect(rawSocket('/r/../../etc/passwd').opened).rejects.toThrow()
    await expect(rawSocket(`/r/${newRoomId()}`, { origin: 'https://evil.example' }).opened).rejects.toThrow('HTTP 403')
    const ok = rawSocket(`/r/${newRoomId()}`, { origin: 'https://nurullahmencik.github.io' })
    await ok.opened
    ok.ws.close()
  })

  it('limits concurrent connections per IP', async () => {
    harness = await startServer({ maxConnectionsPerIp: 2 })
    const roomId = newRoomId()
    const first = rawSocket(`/r/${roomId}`)
    const second = rawSocket(`/r/${roomId}`)
    await Promise.all([first.opened, second.opened])
    await expect(rawSocket(`/r/${roomId}`).opened).rejects.toThrow('HTTP 429')
    first.ws.close()
    await first.closed
    const third = rawSocket(`/r/${roomId}`)
    await third.opened
    second.ws.close()
    third.ws.close()
  })

  it('closes connections that exceed the message rate', async () => {
    harness = await startServer({ messagesPerSecond: 5 })
    const { ws, opened, closed } = rawSocket(`/r/${newRoomId()}`)
    await opened
    // A valid "query awareness" message, sent far faster than allowed.
    for (let i = 0; i < 50; i++) ws.send(Uint8Array.of(3))
    const result = await closed
    expect(result.code).toBe(1008)
  })

  it('keeps state across client reconnects', async () => {
    harness = await startServer()
    const roomId = newRoomId()
    const doc = new Y.Doc()
    const first = track(connect(`r/${roomId}`, doc))
    await synced(first)
    doc.getMap('elements').set('persisted', 'yes')
    await delay(100)
    first.disconnect()
    await waitFor(() => !first.wsconnected, 5000, 'disconnect')

    // A brand new client (fresh doc) receives the state from the server.
    const fresh = track(connect(`r/${roomId}`))
    await synced(fresh)
    await waitFor(() => fresh.doc.getMap('elements').get('persisted') === 'yes', 5000, 'fresh client state')

    // The original client edits while offline and merges on reconnect.
    doc.getMap('elements').set('offline-edit', 'merged')
    first.connect()
    await synced(first)
    await waitFor(() => fresh.doc.getMap('elements').get('offline-edit') === 'merged', 5000, 'offline edit merged')
  })

  it('unloads idle rooms and restores them from SQLite, also across a server restart', async () => {
    const db = tempDbPath()
    try {
      harness = await startServer({ dbPath: db.path, roomIdleMs: 100 })
      const roomId = newRoomId()
      const writer = connect(`r/${roomId}`)
      await synced(writer)
      writer.doc.getMap('elements').set('durable', 'value')
      await delay(150)
      writer.destroy()
      await waitFor(() => harness?.server.rooms.size === 0, 5000, 'room unload')
      expect(harness.persistence.count()).toBe(1)

      const reader = connect(`r/${roomId}`)
      await synced(reader)
      await waitFor(() => reader.doc.getMap('elements').get('durable') === 'value', 5000, 'reload after unload')
      reader.destroy()

      await harness.stop()
      harness = await startServer({ dbPath: db.path })
      const afterRestart = track(connect(`r/${roomId}`))
      await synced(afterRestart)
      await waitFor(() => afterRestart.doc.getMap('elements').get('durable') === 'value', 5000, 'reload after restart')
    } finally {
      await harness?.stop()
      harness = null
      db.cleanup()
    }
  })

  it('refuses awareness updates that impersonate another client', async () => {
    harness = await startServer()
    const roomId = newRoomId()
    const honest = track(connect(`r/${roomId}`))
    const other = track(connect(`r/${roomId}`))
    await Promise.all([synced(honest), synced(other)])
    honest.awareness.setLocalStateField('user', { name: 'Honest' })
    await waitFor(() => other.awareness.getStates().has(honest.doc.clientID), 5000, 'honest awareness')

    // Forge an awareness update for the honest client's id from a raw socket.
    const { encodeAwarenessUpdate, Awareness } = await import('y-protocols/awareness')
    const forgedDoc = new Y.Doc()
    forgedDoc.clientID = honest.doc.clientID
    const forged = new Awareness(forgedDoc)
    forged.setLocalState({ user: { name: 'Mallory' } })
    const meta = forged.meta.get(forgedDoc.clientID)
    if (meta) meta.clock = 1000
    const encoding = await import('lib0/encoding')
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, 1)
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(forged, [forgedDoc.clientID]))
    const raw = rawSocket(`/r/${roomId}`)
    await raw.opened
    raw.ws.send(encoding.toUint8Array(encoder))
    await delay(200)
    const seen = other.awareness.getStates().get(honest.doc.clientID) as { user: { name: string } }
    expect(seen.user.name).toBe('Honest')
    raw.ws.close()
    forged.destroy()
  })
})
