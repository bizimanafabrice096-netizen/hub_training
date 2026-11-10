import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import { errorHandler } from './src/middleware/error.ts';
import aiRoutes from './src/routes/ai.ts';
import analyticsRoutes from './src/routes/analytics.ts';
import authRoutes from './src/routes/auth.ts';
import courseRoutes from './src/routes/courses.ts';
import mediaRoutes from './src/routes/media.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({
        status: 'ok',
        service: 'meridian-academy',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'degraded',
        service: 'meridian-academy',
        database: 'unavailable',
        error: error instanceof Error ? error.message : 'Database check failed',
      });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api', analyticsRoutes);

  app.use(errorHandler);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Meridian Academy server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
