import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from './src/config.js';
import { createApp, connectMongo } from './src/app.js';
import authMiddleware from './src/middleware/auth.js';

const port = config.get('server.port');
const corsOrigins = config.get('server.cors.origins');

await connectMongo();

let io;
const app = createApp({
  authMiddleware,
  onMessage: (message) => {
    if (io) {
      io.to(message.chatId).emit('message', message);
    }
  }
});

const server = http.createServer(app);

io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigins,
    credentials: true
  }
});

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

io.use((socket, next) => {
  try {
    const raw = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;
    if (!token) {
      return next(new Error('unauthenticated'));
    }
    const payload = jwt.verify(token, config.get('jwt.secret'));
    const userId = payload.userId || payload.id || payload.sub;
    if (!userId) {
      return next(new Error('unauthenticated'));
    }
    socket.data = { userId: userId.toString() };
    next();
  } catch (err) {
    next(new Error('unauthenticated'));
  }
});

io.on('connection', socket => {
  socket.on('join', chatId => {
    if (typeof chatId === 'string' && OBJECT_ID_RE.test(chatId)) {
      socket.join(chatId);
    }
  });
});

server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
