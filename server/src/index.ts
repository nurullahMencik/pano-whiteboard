import { loadConfig } from './config.js'
import { createLogger } from './logger.js'
import { SqlitePersistence } from './persistence.js'
import { createPanoServer } from './server.js'

const config = loadConfig()
const log = createLogger(config.logLevel, { service: 'pano-server' })
const persistence = new SqlitePersistence(config.dbPath)
const server = createPanoServer(config, persistence, log)

let shuttingDown = false
const shutdown = async (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  log.info('server.shutdown', { signal })
  try {
    await server.close()
    persistence.close()
    process.exit(0)
  } catch (err) {
    log.error('server.shutdown_failed', { err })
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('uncaughtException', (err) => {
  log.error('process.uncaught_exception', { err })
})
process.on('unhandledRejection', (reason) => {
  log.error('process.unhandled_rejection', { err: reason instanceof Error ? reason : String(reason) })
})

server.listen().catch((err: unknown) => {
  log.error('server.listen_failed', { err })
  process.exit(1)
})
