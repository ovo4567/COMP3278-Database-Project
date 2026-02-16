import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { initRealtime } from './realtime.js';

import { authRouter } from './routes/auth.js';
import { postsRouter } from './routes/posts.js';
import { commentsRouter } from './routes/comments.js';
import { meRouter } from './routes/me.js';
import { chatRouter } from './routes/chat.js';
import { usersRouter } from './routes/users.js';
import { adminRouter } from './routes/admin.js';
import { searchRouter } from './routes/search.js';
import { friendsRouter } from './routes/friends.js';
import { notificationsRouter } from './routes/notifications.js';

const main = async () => {
  await runMigrations();

  const app = express();
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cors({
      origin: config.clientOrigin,
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/notifications', notificationsRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = http.createServer(app);
  initRealtime(server);

  server.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
