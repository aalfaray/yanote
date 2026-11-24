import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The page Orca Mobile downloads from yanote (Settings > Móvil). It runs inside the app's
 * WebView from its own `orca-mobile-web://` origin, under `script-src 'self'`: one module
 * script with an absolute path, like Orca's own page, and nothing inline.
 */
const plainScriptTags = (): Plugin => ({
  name: 'yanote-mobile-plain-script-tags',
  transformIndexHtml: (html) => html.replace(/\s+crossorigin(?:="[^"]*")?/g, ''),
})

export default defineConfig({
  root: 'mobile-web',
  base: '/',
  plugins: [react(), plainScriptTags()],
  build: {
    outDir: '../dist/mobile-web',
    emptyOutDir: true,
    modulePreload: false,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
  },
})
