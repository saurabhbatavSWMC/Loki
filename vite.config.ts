import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function localApi(): Plugin {
  return {
    name: 'local-vercel-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const u = new URL(req.url, 'http://localhost');
        const route = u.pathname.replace(/^\/api\//, '').replace(/\.ts$/, '').replace(/\/+$/, '');
        if (!route || route.includes('/')) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          const handler = mod.default;
          if (typeof handler !== 'function') return next();
          (req as unknown as { query: Record<string, string> }).query =
            Object.fromEntries(u.searchParams.entries());
          const r = res as unknown as {
            status: (code: number) => typeof r;
            json: (body: unknown) => typeof r;
            send: (body: unknown) => typeof r;
          };
          r.status = (code: number) => { res.statusCode = code; return r; };
          r.json = (body: unknown) => {
            if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(body));
            return r;
          };
          r.send = (body: unknown) => {
            if (typeof body === 'string' || Buffer.isBuffer(body)) res.end(body);
            else res.end(JSON.stringify(body));
            return r;
          };
          await handler(req, res);
        } catch (err) {
          server.config.logger.error(`[local-api] ${route}: ${(err as Error).message}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'dev_handler_failed', message: (err as Error).message }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    localApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon-180.png'],
      manifest: {
        name: 'BeatStudio',
        short_name: 'BeatStudio',
        description: 'Cassette-style beat recorder and mixer',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#D93A1C',
        background_color: '#F0EBDF',
        icons: [
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
          { src: 'apple-touch-icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
