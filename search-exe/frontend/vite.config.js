import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the Express backend so the frontend
      // doesn't need to hardcode http://localhost:5000
      '/api': 'http://localhost:5000',
    },
  },
})
