require('dotenv').config();

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const http       = require('http');
const jwt        = require('jsonwebtoken');
const { Server } = require('socket.io');

// Routers
const authRouter      = require('./routes/auth');
const keybundleRouter = require('./routes/keybundle');

const app = express();

// ────────────────── Security & Parsing ──────────────────
app.use(helmet());
app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
      credentials: true
    })
);
app.use(express.json());

// ────────────────── Database Connection ──────────────────
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/secureMessenger';
mongoose
    .connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    .then(() => console.log('🔗 MongoDB connected'))
    .catch(err => {
      console.error('❌ MongoDB connection error:', err);
      process.exit(1);
    });

// ────────────────── Rate Limiting ──────────────────
app.use(
    rateLimit({
      windowMs: 60_000,  // 1 minute
      max: 100,          // limit each IP
      standardHeaders: true,
      legacyHeaders: false
    })
);

// ────────────────── REST Endpoints ──────────────────
app.use('/api/auth', authRouter);
app.use('/api/keybundle', keybundleRouter);

// Messages endpoint: save to DB via messagesRouter or inline
app.post('/api/messages', async (req, res) => {
  // Предполагается, что messagesRouter сохраняет сообщение, но если нужно — можно реализовать здесь
  const { to, from, text, timestamp } = req.body;
  try {
    // импорт модели Message
    const Message = require('./models/Message');
    const msg = new Message({ to, from, text, timestamp });
    await msg.save();

    // Шлём через WebSocket
    global.io.to(to).emit('newMessage', { to, from, text, timestamp });

    return res.status(201).json({ success: true });
  } catch (e) {
    console.error('❌ Error saving message:', e);
    return res.status(500).json({ error: 'Message save failed' });
  }
});

app.get('/', (_req, res) => {
  res.send('🚀 Secure Messenger API is up and running!');
});

// ────────────────── WebSocket Setup ──────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*' }
});
// make io accessible in routes
global.io = io;

// JWT middleware for Socket.IO
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('No auth token'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.userId;
    return next();
  } catch (err) {
    console.error('❌ WS auth error:', err);
    return next(new Error('Invalid token'));
  }
});

io.on('connection', socket => {
  console.log('✅ WS connected', socket.id, 'user', socket.userId);

  socket.on('join', room => {
    socket.join(room);
    console.log(`→ ${socket.id} joined ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ WS disconnected', socket.id);
  });
});

// ────────────────── Server Start ──────────────────
const PORT = process.env.PORT || 3000;
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} already in use. Change PORT in .env or free it.`);
    process.exit(1);
  }
});
server.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
});
