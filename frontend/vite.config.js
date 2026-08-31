import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend only calls the backend API (all external fetches go through the backend proxy).
// Proxy /api and /oauth to the backend (:3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/oauth': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
