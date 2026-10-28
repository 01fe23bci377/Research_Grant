import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The console talks to the AURA API; proxy keeps a single origin in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
