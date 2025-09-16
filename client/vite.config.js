// client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            // подключаем UMD-файл как модуль
            'libsignal-protocol': path.resolve(
                __dirname,
                'src/crypto/libsignal-protocol.js'
            ),
            '@': path.resolve(__dirname, 'src')
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            },
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
    },
    define: { global: 'window' }   // полифил для Node-глобалов
});
