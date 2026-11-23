import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { mdxeditorLazyTableCells, mdxeditorLazyTableCellsOptimizer } from './vite-plugins/mdxeditorLazyTableCells.ts'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    mdxeditorLazyTableCells(),
    tailwindcss(),
    react(),
  ],
  optimizeDeps: {
    rolldownOptions: {
      plugins: [mdxeditorLazyTableCellsOptimizer()],
    },
  },
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
})
