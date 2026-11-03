import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { createLogger } from '../src/logger.js'
import { IpLimiter, TokenBucket } from '../src/limits.js'
import { isEmptyUpdate } from '../src/protocol.js'
import { parseRoomPath, viewIdFor } from '../src/rooms.js'
import * as Y from 'yjs'

describe('room addressing', () => {
  const roomId = 'AbCdEfGhIjKlMnOpQrStUv'

  it('maps edit and view paths to the same internal key', () => {
    const edit = parseRoomPath(`/r/${roomId}`)
    const view = parseRoomPath(`/v/${viewIdFor(roomId)}`)
    expect(edit).toEqual({ key: viewIdFor(roomId), readOnly: false })
    expect(view).toEqual({ key: viewIdFor(roomId), readOnly: true })
  })

  it('rejects malformed ids and unknown prefixes', () => {
    expect(parseRoomPath('/r/short')).toBeNull()
    expect(parseRoomPath('/r/has space in it 12345')).toBeNull()
    expect(parseRoomPath(`/x/${roomId}`)).toBeNull()
    expect(parseRoomPath('/v/not-a-hash')).toBeNull()
    expect(parseRoomPath(`/r/${roomId}/extra`)).toBeNull()
  })

  it('derives a view id that does not contain the room id', () => {
    const viewId = viewIdFor(roomId)
    expect(viewId).toHaveLength(43)
    expect(viewId.includes(roomId)).toBe(false)
  })
})

describe('limits', () => {
  it('token bucket refills over time', () => {
    let now = 0
    const bucket = new TokenBucket(2, 1, () => now)
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(false)
    now = 1000
    expect(bucket.take()).toBe(true)
  })

  it('ip limiter enforces concurrency and rate', () => {
    let now = 0
    const limiter = new IpLimiter(2, 4, () => now)
    expect(limiter.tryAcquire('1.1.1.1')).toBeNull()
    expect(limiter.tryAcquire('1.1.1.1')).toBeNull()
    expect(limiter.tryAcquire('1.1.1.1')).toBe('too-many-connections')
    limiter.release('1.1.1.1')
    limiter.release('1.1.1.1')
    expect(limiter.tryAcquire('1.1.1.1')).toBe('rate-limited')
    now = 60_000
    expect(limiter.tryAcquire('1.1.1.1')).toBeNull()
    expect(limiter.tryAcquire('2.2.2.2')).toBeNull()
  })
})

describe('protocol helpers', () => {
  it('detects empty updates', () => {
    const doc = new Y.Doc()
    expect(isEmptyUpdate(Y.encodeStateAsUpdate(doc))).toBe(true)
    doc.getMap('m').set('a', 1)
    expect(isEmptyUpdate(Y.encodeStateAsUpdate(doc))).toBe(false)
  })
})

describe('config + logger', () => {
  it('reads Render style env vars', () => {
    const config = loadConfig({ PORT: '10000', TRUST_PROXY: 'true', ALLOWED_ORIGINS: 'https://a.dev, https://b.dev' })
    expect(config.port).toBe(10000)
    expect(config.trustProxy).toBe(true)
    expect(config.allowedOrigins).toEqual(['https://a.dev', 'https://b.dev'])
    expect(loadConfig({}).port).toBe(5312)
  })

  it('writes one JSON object per line', () => {
    const lines: string[] = []
    const log = createLogger('info', { service: 'test' }, (line) => lines.push(line))
    log.debug('hidden')
    log.child({ room: 'abc' }).warn('hello', { n: 1 })
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>
    expect(parsed).toMatchObject({ level: 'warn', msg: 'hello', service: 'test', room: 'abc', n: 1 })
  })
})
