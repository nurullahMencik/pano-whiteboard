export interface ServerConfig {
  /** TCP port. Render injects `PORT`; locally we default to 5312. */
  port: number
  host: string
  /** SQLite file path, or `:memory:` to keep everything in RAM. */
  dbPath: string
  /** Hard limit for a single WebSocket frame (bytes). Larger frames close the socket with 1009. */
  maxMessageBytes: number
  /** Upper bound for a single room document (bytes, approximate). */
  maxDocBytes: number
  /** Concurrent WebSocket connections allowed from one IP. */
  maxConnectionsPerIp: number
  /** New WebSocket connections per IP per minute (token bucket refill rate). */
  connectionsPerMinute: number
  /** Messages per second per connection (token bucket refill rate, burst = 2x). */
  messagesPerSecond: number
  /** Bytes per second per connection (token bucket refill rate, burst = 2x max message). */
  bytesPerSecond: number
  /** How long an empty room stays in memory before it is persisted and unloaded. */
  roomIdleMs: number
  /** Debounce for persisting a room after the last change. */
  persistDebounceMs: number
  /** Comma separated list of allowed `Origin` headers. Empty = allow all. */
  allowedOrigins: string[]
  /** Use the left-most `X-Forwarded-For` entry as the client IP (behind Render's proxy). */
  trustProxy: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent'
  version: string
}

const int = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const logLevel = (LOG_LEVELS as readonly string[]).includes(env.LOG_LEVEL ?? '')
    ? (env.LOG_LEVEL as ServerConfig['logLevel'])
    : 'info'
  return {
    port: int(env.PORT, 5312),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? './data/pano.db',
    maxMessageBytes: int(env.MAX_MESSAGE_BYTES, 4 * 1024 * 1024),
    maxDocBytes: int(env.MAX_DOC_BYTES, 16 * 1024 * 1024),
    maxConnectionsPerIp: int(env.MAX_CONNECTIONS_PER_IP, 20),
    connectionsPerMinute: int(env.CONNECTIONS_PER_MINUTE, 60),
    messagesPerSecond: int(env.MESSAGES_PER_SECOND, 200),
    bytesPerSecond: int(env.BYTES_PER_SECOND, 2 * 1024 * 1024),
    roomIdleMs: int(env.ROOM_IDLE_MS, 60_000),
    persistDebounceMs: int(env.PERSIST_DEBOUNCE_MS, 2_000),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    logLevel,
    version: env.APP_VERSION ?? '1.0.0',
  }
}
