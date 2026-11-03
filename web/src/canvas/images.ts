import { isSafeImageUrl } from '../lib/export'

/** Source files above this size are rejected before decoding. */
export const MAX_IMAGE_SOURCE_BYTES = 8 * 1024 * 1024
/** Encoded size budget per image stored in the document. */
export const MAX_IMAGE_BYTES = 300 * 1024
/** Total image budget per board (keeps full-document syncs small). */
export const MAX_BOARD_IMAGE_BYTES = 3 * 1024 * 1024

export type ImageError = 'unsupported' | 'tooLarge' | 'failed'

export interface ProcessedImage {
  dataUrl: string
  width: number
  height: number
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })

/**
 * Decodes, downsizes and re-encodes an image so it fits the per-image budget.
 * Everything (including SVG) is rasterised, so no active content reaches the doc.
 */
export const processImage = async (file: File): Promise<ProcessedImage | ImageError> => {
  if (!file.type.startsWith('image/')) return 'unsupported'
  if (file.size > MAX_IMAGE_SOURCE_BYTES) return 'tooLarge'
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return 'failed'
  }
  try {
    let maxSide = 1600
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return 'failed'
      ctx.drawImage(bitmap, 0, 0, width, height)
      for (const quality of [0.86, 0.72, 0.58]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
        if (blob && blob.size <= MAX_IMAGE_BYTES) return { dataUrl: await blobToDataUrl(blob), width, height }
      }
      maxSide = Math.round(maxSide * 0.7)
    }
    return 'tooLarge'
  } finally {
    bitmap.close()
  }
}

/** Short content hash used as asset id, so the same image is stored once. */
export const assetIdFor = async (dataUrl: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl))
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Decoded images per asset id; notifies when a new one becomes drawable. */
export class ImageCache {
  private readonly images = new Map<string, { src: string; img: HTMLImageElement; ready: boolean }>()

  constructor(private readonly onLoad: () => void) {}

  get(id: string, src: string | undefined): HTMLImageElement | null {
    if (!src || !isSafeImageUrl(src)) return null
    const entry = this.images.get(id)
    if (entry && entry.src === src) return entry.ready ? entry.img : null
    const img = new Image()
    const next = { src, img, ready: false }
    this.images.set(id, next)
    img.onload = () => {
      next.ready = true
      this.onLoad()
    }
    img.src = src
    return null
  }
}
