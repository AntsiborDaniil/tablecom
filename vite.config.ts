import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // shadcn/tailwind.css uses @theme / @utility / @custom-variant — LightningCSS minify logs hundreds of warnings.
  build: {
    cssMinify: 'esbuild',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
