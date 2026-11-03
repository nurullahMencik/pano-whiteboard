import { useSyncExternalStore } from 'react'

/** Base path the app is served from (`/pano-whiteboard/` on GitHub Pages). */
export const BASE = import.meta.env.BASE_URL

const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of listeners) listener()
}

window.addEventListener('popstate', notify)

/** Path relative to BASE, without leading/trailing slashes. */
export const currentRoute = () => {
  const path = window.location.pathname
  const relative = path.startsWith(BASE) ? path.slice(BASE.length) : path.replace(/^\//, '')
  return relative.replace(/\/+$/, '')
}

export const useRoute = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    currentRoute,
  )

export const hrefFor = (route: string) => `${BASE}${route}`

export const navigate = (route: string, replace = false) => {
  const url = hrefFor(route)
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  notify()
  window.scrollTo(0, 0)
}

export type Route = { name: 'home' } | { name: 'board'; kind: 'r' | 'v'; id: string } | { name: 'notFound' }

export const parseRoute = (route: string): Route => {
  if (route === '' || route === 'index.html') return { name: 'home' }
  const match = /^(b|v)\/([A-Za-z0-9_-]+)$/.exec(route)
  if (match) return { name: 'board', kind: match[1] === 'b' ? 'r' : 'v', id: match[2] }
  return { name: 'notFound' }
}
