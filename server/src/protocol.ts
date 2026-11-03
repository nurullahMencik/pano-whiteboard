import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'

/** Top-level message types used by y-websocket. */
export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
export const MESSAGE_AUTH = 2
export const MESSAGE_QUERY_AWARENESS = 3

/** Sync sub-types (y-protocols/sync). */
export const SYNC_STEP1 = 0
export const SYNC_STEP2 = 1
export const SYNC_UPDATE = 2

/** An encoded Yjs update with no structs and an empty delete set. */
export const isEmptyUpdate = (update: Uint8Array): boolean =>
  update.byteLength <= 2 && update.every((byte) => byte === 0)

/** Reads the client ids contained in an awareness update without applying it. */
export const readAwarenessClients = (update: Uint8Array): number[] => {
  const decoder = decoding.createDecoder(update)
  const len = decoding.readVarUint(decoder)
  const clients: number[] = []
  for (let i = 0; i < len; i++) {
    clients.push(decoding.readVarUint(decoder))
    decoding.readVarUint(decoder) // clock
    decoding.readVarString(decoder) // JSON state
  }
  return clients
}

export const encodeMessage = (type: number, write: (encoder: encoding.Encoder) => void): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, type)
  write(encoder)
  return encoding.toUint8Array(encoder)
}
