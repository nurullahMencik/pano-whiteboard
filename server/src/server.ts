import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type RawData } from 'ws'
import type { ServerConfig } from './config.js'
import { IpLimiter, TokenBucket } from './limits.js'
import type { Logger } from './logger.js'
import type { Persistence } from './persistence.js'
import { CLOSE, Room, type Connection } from './room.js'
import { logKey, parseRoomPath } from './rooms.js'

export interface PanoServer {
  readonly http: Server
  readonly rooms: Map<string, Room>
  listen(): Promise<number>
  close(): Promise<void>
}

const HEARTBEAT_MS = 30_000

const toUint8 = (data: RawData): Uint8Array => {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

export const createPanoServer = (config: ServerConfig, persistence: Persistence, log: Logger): PanoServer => {
  const rooms = new Map<string, Room>()
  const ipLimiter = new IpLimiter(config.maxConnectionsPerIp, config.connectionsPerMinute)
  const startedAt = Date.now()
  let connectionSeq = 0
  let connectionCount = 0

  const clientIp = (req: IncomingMessage): string => {
    if (config.trustProxy) {
      // Render, Cloudflare'in arkasında çalışır: CF-Connecting-IP / True-Client-IP Cloudflare
      // tarafından yazılır ve istemci değiştiremez. X-Forwarded-For'un ilk değerini ise istemci
      // kendisi gönderebilir, bu yüzden yalnız son çare olarak kullanılır.
      for (const name of ['cf-connecting-ip', 'true-client-ip']) {
        const value = req.headers[name]
        const ip = (Array.isArray(value) ? value[0] : value)?.trim()
        if (ip) return ip
      }
      const forwarded = req.headers['x-forwarded-for']
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
      if (first) return first
    }
    return req.socket.remoteAddress ?? 'unknown'
  }

  const getRoom = (key: string): Room => {
    let room = rooms.get(key)
    if (!room) {
      room = new Room(key, persistence, config, log, (idle) => {
        idle.destroy()
        rooms.delete(idle.key)
        log.info('room.unloaded', { room: logKey(idle.key), rooms: rooms.size })
      })
      rooms.set(key, room)
      log.info('room.opened', { room: logKey(key), rooms: rooms.size, bytes: room.size })
    }
    return room
  }

  const handleHttp = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      const body = JSON.stringify({
        status: 'ok',
        version: config.version,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        rooms: rooms.size,
        connections: connectionCount,
      })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        // The web client pings /health to wake a sleeping instance; it needs to read the result.
        'access-control-allow-origin': '*',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
      return
    }
    if (url.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Pano realtime server. Connect via WebSocket to /r/<roomId> or /v/<viewId>.\n')
      return
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'not_found' }))
  }

  const http = createServer(handleHttp)
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxMessageBytes, perMessageDeflate: false })

  const reject = (socket: Duplex, status: number, message: string) => {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    socket.destroy()
  }

  http.on('upgrade', (req, socket, head) => {
    const ip = clientIp(req)
    const url = new URL(req.url ?? '/', 'http://localhost')
    const address = parseRoomPath(url.pathname)
    if (!address) {
      log.warn('upgrade.rejected', { ip, reason: 'invalid-room' })
      reject(socket, 400, 'Bad Request')
      return
    }
    const origin = req.headers.origin
    if (config.allowedOrigins.length > 0 && (!origin || !config.allowedOrigins.includes(origin))) {
      log.warn('upgrade.rejected', { ip, origin, reason: 'origin' })
      reject(socket, 403, 'Forbidden')
      return
    }
    const limited = ipLimiter.tryAcquire(ip)
    if (limited) {
      log.warn('upgrade.rejected', { ip, reason: limited })
      reject(socket, 429, 'Too Many Requests')
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const room = getRoom(address.key)
      const conn: Connection = {
        id: ++connectionSeq,
        ws,
        ip,
        readOnly: address.readOnly,
        controlledIds: new Set(),
        messages: new TokenBucket(config.messagesPerSecond * 2, config.messagesPerSecond),
        bytes: new TokenBucket(Math.max(config.bytesPerSecond, config.maxMessageBytes) * 2, config.bytesPerSecond),
        rejectedWrites: 0,
        alive: true,
      }
      connectionCount++
      log.info('connection.open', {
        conn: conn.id,
        room: logKey(room.key),
        ip,
        readOnly: conn.readOnly,
        peers: room.conns.size + 1,
      })

      let released = false
      const cleanup = (code: number) => {
        if (released) return
        released = true
        connectionCount--
        ipLimiter.release(ip)
        room.removeConnection(conn)
        log.info('connection.close', { conn: conn.id, room: logKey(room.key), code, peers: room.conns.size })
      }

      ws.on('message', (data, isBinary) => {
        if (!isBinary) {
          ws.close(CLOSE.invalidData, 'binary frames only')
          return
        }
        const bytes = toUint8(data)
        if (!conn.messages.take() || !conn.bytes.take(bytes.byteLength)) {
          log.warn('connection.rate_limited', { conn: conn.id, ip })
          ws.close(CLOSE.policy, 'rate limited')
          return
        }
        try {
          const result = room.handleMessage(conn, bytes)
          if (result) ws.close(result.code, result.reason)
        } catch (err) {
          log.warn('message.invalid', { conn: conn.id, err })
          ws.close(CLOSE.invalidData, 'malformed message')
        }
      })
      ws.on('pong', () => {
        conn.alive = true
      })
      ws.on('error', (err) => {
        log.warn('connection.error', { conn: conn.id, err: err.message })
      })
      ws.on('close', (code) => cleanup(code))

      room.addConnection(conn)
    })
  })

  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const conn of room.conns.values()) {
        if (!conn.alive) {
          conn.ws.terminate()
          continue
        }
        conn.alive = false
        conn.ws.ping()
      }
    }
    ipLimiter.sweep()
  }, HEARTBEAT_MS)
  heartbeat.unref()

  return {
    http,
    rooms,
    listen: () =>
      new Promise((resolve, reject) => {
        http.once('error', reject)
        http.listen(config.port, config.host, () => {
          const address = http.address()
          const port = typeof address === 'object' && address ? address.port : config.port
          log.info('server.listening', { port, host: config.host, version: config.version })
          resolve(port)
        })
      }),
    close: async () => {
      clearInterval(heartbeat)
      for (const client of wss.clients) client.close(1001, 'server shutting down')
      for (const room of rooms.values()) room.destroy()
      rooms.clear()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
      http.closeAllConnections()
      await new Promise<void>((resolve) => http.close(() => resolve()))
      log.info('server.closed')
    },
  }
}
