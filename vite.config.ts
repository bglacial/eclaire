import { defineConfig } from 'vite';
import packageInfo from './package.json';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageInfo.version) },
  plugins: [{
    name: 'eclaire-version',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: packageInfo.version }) }); },
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ version: packageInfo.version }));
      });
    },
  }],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, timeout: 180_000 } }, watch: { ignored: ['**/server/data/**', '**/server/target/**', '**/android/**'] } },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } } },
});
