import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** GitHub Pages serves 404.html for unknown paths; a copy of index.html makes deep links work. */
const spaFallback = (): Plugin => ({
  name: 'pano-spa-fallback',
  apply: 'build',
  closeBundle() {
    const out = resolve(import.meta.dirname, 'dist')
    copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'))
  },
})

export default defineConfig({
  base: '/pano-whiteboard/',
  plugins: [react(), tailwindcss(), spaFallback()],
  server: { port: 5311, strictPort: true },
  preview: { port: 5311, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
})
