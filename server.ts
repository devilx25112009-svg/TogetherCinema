import http from 'node:http';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { createCinemaExpressApp } from './src/server/app';
import { attachCinemaWebSocket } from './src/server/ws/cinemaWs';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const { app, store, setBroadcaster } = createCinemaExpressApp();
  const httpServer = http.createServer(app);
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 120_000;
  httpServer.keepAliveTimeout = 65_000;

  const wsHub = attachCinemaWebSocket(httpServer, store);
  setBroadcaster(wsHub.broadcastToRoom);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Together Cinema server listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Together Cinema server:', err);
  process.exit(1);
});
