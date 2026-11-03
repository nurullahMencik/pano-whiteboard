const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 128-bit random room id, base64url encoded (22 chars). Doubles as the edit capability. */
export const createRoomId = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

/** Short random id for elements and assets. */
export const createId = (length = 12): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let id = ''
  for (const byte of bytes) id += ALPHABET[byte & 63]
  return id
}

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
export const VIEW_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/

/**
 * Read-only id = base64url(sha256("pano:view:" + roomId)). Mirrors the server's
 * derivation; it is one-way, so a viewer can never recover the edit link.
 */
export const viewIdFor = async (roomId: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pano:view:${roomId}`))
  return toBase64Url(new Uint8Array(digest))
}
