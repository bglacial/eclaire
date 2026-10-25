import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, timeout: 180_000 } }, watch: { ignored: ['**/server/data/**', '**/server/target/**', '**/android/**'] } },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } } },
});
