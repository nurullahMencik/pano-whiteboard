/**
 * WebSocket server base URL. Set `VITE_WS_URL` at build time (GitHub Actions
 * takes it from the `WS_URL` repository variable). In development it defaults
 * to the local server; an empty value in production means "local-only mode".
 */
const configured = (import.meta.env.VITE_WS_URL as string | undefined)?.trim()

export const WS_URL: string | null = configured
  ? configured.replace(/\/+$/, '')
  : import.meta.env.DEV
    ? 'ws://localhost:5312'
    : null

export const REPO_URL = 'https://github.com/nurullahmencik/pano-whiteboard'
export const PORTFOLIO_URL = 'https://www.nurullahmencik.com'
