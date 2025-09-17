import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import morgan from 'morgan';
import config from './config.js';
import mongoose from 'mongoose';
import messagesRouter from './routes/messages.js';
import authRouter from './routes/auth.js';
import buildKeybundleRouter from './routes/keybundle.js';
import authMiddleware from './middleware/auth.js';

export async function connectMongo(uri = config.get('mongo.uri')) {
  await mongoose.connect(uri);
}

export function createApp({ authMiddleware: overrideAuth, audit, logger = console, messageObserver, onMessage } = {}) {
  const app = express();
  app.locals.logger = logger;

  const auditStream = {
    write: (str) => {
      const line = str.endsWith('\n') ? str.slice(0, -1) : str;
      if (audit) {
        audit(line);
      } else {
        logger.info?.(line) ?? logger.log?.(line);
      }
    }
  };

  app.use(helmet());
  app.use(cors({ origin: config.get('server.cors.origins'), credentials: true }));
  app.use(express.json({ limit: config.get('server.jsonLimit'), strict: true }));
  app.use(morgan('tiny', { stream: auditStream }));
  app.use(rateLimit({ windowMs: 60_000, max: 300 }));

  app.use('/api/auth', authRouter);

  const pass = (req, _res, next) => next();
  const auth = overrideAuth || authMiddleware || pass;

  app.use('/api/keybundle', buildKeybundleRouter(auth));
  if (typeof messageObserver === 'function') {
    app.use('/api/messages', (req, _res, next) => {
      try {
        messageObserver(req.body);
      } catch (err) {
        logger.error?.('messageObserver_failed', err);
      }
      next();
    });
  }
  app.use('/api/messages', messagesRouter({ auth, onMessage }));

  app.get('/', (_req, res) => {
    res.send('Secure Messenger API');
  });

  app.use((err, _req, res, _next) => {
    logger.error?.('Unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
