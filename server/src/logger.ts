export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const ORDER: Record<LogLevel | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }

export interface Logger {
  debug(msg: string, fields?: Fields): void
  info(msg: string, fields?: Fields): void
  warn(msg: string, fields?: Fields): void
  error(msg: string, fields?: Fields): void
  child(fields: Fields): Logger
}

/**
 * Minimal structured logger: one JSON object per line on stdout/stderr, which is
 * what Render (and most log drains) index best. No dependencies on purpose.
 */
export const createLogger = (
  level: LogLevel | 'silent' = 'info',
  base: Fields = {},
  write: (line: string, level: LogLevel) => void = (line, lvl) => {
    if (lvl === 'error' || lvl === 'warn') process.stderr.write(line + '\n')
    else process.stdout.write(line + '\n')
  },
): Logger => {
  const threshold = ORDER[level]
  const log = (lvl: LogLevel, msg: string, fields?: Fields) => {
    if (ORDER[lvl] < threshold) return
    const entry: Fields = { time: new Date().toISOString(), level: lvl, msg, ...base, ...fields }
    if (entry.err instanceof Error) {
      entry.err = { message: entry.err.message, name: entry.err.name, stack: entry.err.stack }
    }
    write(JSON.stringify(entry), lvl)
  }
  return {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
    child: (fields) => createLogger(level, { ...base, ...fields }, write),
  }
}
