/** localStorage helpers that never throw (private mode, quota, disabled storage). */
export const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export const writeJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: preferences simply do not persist.
  }
}

export interface RecentBoard {
  kind: 'r' | 'v'
  id: string
  title: string
  openedAt: number
  thumb?: string
}

const RECENT_KEY = 'pano:recent'
const RECENT_LIMIT = 9

export const loadRecent = (): RecentBoard[] => {
  const list = readJson<RecentBoard[]>(RECENT_KEY, [])
  return Array.isArray(list) ? list.filter((b) => typeof b.id === 'string' && (b.kind === 'r' || b.kind === 'v')) : []
}

export const touchRecent = (entry: Omit<RecentBoard, 'openedAt'> & { openedAt?: number }) => {
  const list = loadRecent().filter((b) => !(b.id === entry.id && b.kind === entry.kind))
  const previous = loadRecent().find((b) => b.id === entry.id && b.kind === entry.kind)
  list.unshift({ ...previous, ...entry, openedAt: entry.openedAt ?? Date.now() })
  writeJson(RECENT_KEY, list.slice(0, RECENT_LIMIT))
}

export const removeRecent = (kind: 'r' | 'v', id: string) => {
  writeJson(
    RECENT_KEY,
    loadRecent().filter((b) => !(b.id === id && b.kind === kind)),
  )
}

const PENDING_KEY = 'pano:pending-seed'

/** Remembers which template a just-created board should be seeded with. */
export const setPendingSeed = (roomId: string, template: string) => {
  try {
    window.sessionStorage.setItem(`${PENDING_KEY}:${roomId}`, template)
  } catch {
    // ignore
  }
}

export const peekPendingSeed = (roomId: string): string | null => {
  try {
    return window.sessionStorage.getItem(`${PENDING_KEY}:${roomId}`)
  } catch {
    return null
  }
}

export const clearPendingSeed = (roomId: string) => {
  try {
    window.sessionStorage.removeItem(`${PENDING_KEY}:${roomId}`)
  } catch {
    // ignore
  }
}
