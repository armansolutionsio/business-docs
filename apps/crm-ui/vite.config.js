import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      // Proxy API calls to Core API in dev (avoids CORS issues in browser)
      '/api/core': {
        target: process.env.VITE_CORE_API_URL || 'http://localhost:8003',
        rewrite: (path) => path.replace(/^\/api\/core/, ''),
        changeOrigin: true,
      },
      '/api/docs': {
        target: process.env.VITE_BUSINESS_DOCS_URL || 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api\/docs/, '/api'),
        changeOrigin: true,
      },
    },
  },
});
