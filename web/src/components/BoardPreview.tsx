import { useEffect, useMemo, useState } from 'react'
import { boardToSvg } from '../lib/export'
import type { SeedContent } from '../lib/templates'
import type { ElementData } from '../lib/types'

/** Seed inputs → render snapshots without going through a Y.Doc (keeps Yjs off the landing page). */
const toElements = (content: SeedContent): ElementData[] =>
  content.elements.map((input, i) => ({
    rotation: 0,
    strokeStyle: 'solid',
    opacity: 1,
    ...input,
    id: `p${i}`,
    z: input.z ?? i,
    version: 0,
  }))

/**
 * Static SVG rendering of seed content, produced by the same exporter the
 * board uses. Used for the hero image and the template cards, so the landing
 * page needs neither the canvas engine nor a server connection.
 */
export const BoardPreview = ({
  content,
  theme,
  label,
  className,
}: {
  content: SeedContent
  theme: 'light' | 'dark'
  label: string
  className?: string
}) => {
  // Re-measure text once the web font is ready so wrapping matches the board.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const svg = useMemo(() => {
    const assets = content.assets ?? {}
    return boardToSvg(toElements(content), { theme, background: false, padding: 24, assets: (id) => assets[id] }).svg.replace(
      '<svg ',
      `<svg data-fonts="${fontsReady ? '1' : '0'}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%" `,
    )
  }, [content, theme, fontsReady])
  return <div role="img" aria-label={label} className={className} dangerouslySetInnerHTML={{ __html: svg }} />
}
