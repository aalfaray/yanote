import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mdxeditorLazyTableCells, mdxeditorLazyTableCellsOptimizer } from './vite-plugins/mdxeditorLazyTableCells.ts'

// https://vite.dev/config/
export default defineConfig({
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
