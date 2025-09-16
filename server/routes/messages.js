const express = require('express');
const Message = require('../models/Message');
const auth    = require('../middleware/auth');

const router = express.Router();

// POST /api/messages
router.post('/', auth, async (req, res) => {
  const { chatId, encryptedPayload } = req.body;
  try {
    const message = await Message.create({
      chatId,
      senderId: req.user.userId,
      encryptedPayload
    });
    // единственный broadcast
    global.io.to(chatId).emit('message', message);
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// GET /api/messages/:chatId
router.get('/:chatId', auth, async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId })
        .sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
