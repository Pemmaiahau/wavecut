import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// MediaPipe's wasm runtime must be served same-origin: under
// Cross-Origin-Embedder-Policy: require-corp the browser refuses to load it
// from a CDN. This plugin serves /mediapipe/wasm/* straight out of
// node_modules in dev, and copies the files into dist/ on build.
// process.cwd() rather than import.meta.url: wrangler's auto-config parses
// this file with esprima, which does not understand import.meta.
const MP_WASM_DIR   = join(process.cwd(), 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const MP_WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]
const MP_PUBLIC_PATH = '/mediapipe/wasm/'

function mediapipeAssets() {
  let outDir = 'dist'
  return {
    name: 'mediapipe-assets',
    configResolved(config) { outDir = config.build.outDir },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0]
        if (!url.startsWith(MP_PUBLIC_PATH)) return next()
        const name = url.slice(MP_PUBLIC_PATH.length)
        if (!MP_WASM_FILES.includes(name)) return next()
        const file = join(MP_WASM_DIR, name)
        if (!existsSync(file)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.setHeader('Cache-Control', 'public, max-age=31536000')
        res.end(readFileSync(file))
      })
    },
    closeBundle() {
      const dest = join(outDir, 'mediapipe', 'wasm')
      mkdirSync(dest, { recursive: true })
      for (const f of MP_WASM_FILES) copyFileSync(join(MP_WASM_DIR, f), join(dest, f))
    },
  }
}

export default defineConfig({
  plugins: [react(), mediapipeAssets()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
