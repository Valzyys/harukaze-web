import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run dev` menjalankan Vite; /api diteruskan ke `wrangler dev` (port 8787).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
