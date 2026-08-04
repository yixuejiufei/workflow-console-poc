import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3002,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8002',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
