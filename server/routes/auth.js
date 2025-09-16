// server/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const config  = require('config');

const router = express.Router();

// Логируем входящие тела запросов
router.use((req, res, next) => {
  console.log('AUTH.ROUTE', req.method, req.path, 'body=', req.body);
  next();
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password, publicKey } = req.body;
  if (!username || !email || !password || !publicKey) {
    return res.status(400).json({ msg: 'Все поля обязательны' });
  }
  try {
    if (await User.findOne({ email })) {
      return res.status(400).json({ msg: 'Пользователь уже существует' });
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const user = new User({ username, email, password: hash, publicKey });
    await user.save();
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || config.get('jwtSecret'),
      { expiresIn: '7d' }
    );
    res.json({ token, userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log('▶▶▶ [AUTH.LOGIN] Заголовки:', req.headers);
  console.log('▶▶▶ [AUTH.LOGIN] Тело запроса:', req.body);
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ msg: 'Email и пароль обязательны' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Неверные email или пароль' });
    }
    if (!await bcrypt.compare(password, user.password)) {
      return res.status(400).json({ msg: 'Неверные email или пароль' });
    }
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || config.get('jwtSecret'),
      { expiresIn: '7d' }
    );
    res.json({ token, userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
