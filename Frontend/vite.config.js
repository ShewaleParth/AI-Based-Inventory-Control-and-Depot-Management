import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Node.js API (port 5000)
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        // Rewrite cookie domain so the browser stores & re-sends httpOnly cookies
        // correctly when going through the Vite dev proxy (localhost:5173 → localhost:5000)
        cookieDomainRewrite: 'localhost',
      },
      // Python/Flask ML API (port 5001) - /ml-api/* → /api/ml/*
      '/ml-api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ml-api/, '/api/ml')
      },
      // Python/Flask Supplier Risk API (port 5001) - /supplier-api/* → /api/supplier/*
      '/supplier-api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/supplier-api/, '/api/supplier')
      }
    }
  }
})


