// client/vite.config.js
import path from 'path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'libsignal-protocol': path.resolve(__dirname, 'src/crypto/libsignal-protocol.js'),
      '@': path.resolve(__dirname, 'src'),
      'node:worker_threads': '/@empty-worker-threads',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      plugins: [
        {
          name: 'empty-worker-threads',
          resolveId(id) {
            if (id === '/@empty-worker-threads') {
              return id;
            }
            return null;
          },
          load(id) {
            if (id === '/@empty-worker-threads') {
              return 'export default {};';
            }
            return null;
          },
        },
      ],
    },
  },
  worker: {
    format: 'es',
  },
  define: { global: 'window' },
});
