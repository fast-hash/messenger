// server/routes/keybundle.js
const express   = require('express');
const auth      = require('../middleware/auth');
const KeyBundle = require('../models/KeyBundle');

const router = express.Router();

/**
 * POST /api/keybundle
 * Сохраняем или обновляем набор ключей текущего пользователя.
 * В body ожидаем:
 *   identityKey: String,
 *   signedPreKey: { keyId, publicKey, signature },
 *   oneTimePreKeys: [ { keyId, publicKey } ]
 */
router.post('/', auth, async (req, res) => {
  const userId = req.user.userId;
  const { identityKey, signedPreKey, oneTimePreKeys } = req.body;

  if (!identityKey || !signedPreKey || !Array.isArray(oneTimePreKeys)) {
    return res.status(400).json({ msg: 'Invalid key bundle payload' });
  }

  try {
    await KeyBundle.findOneAndUpdate(
      { userId },
      {
        userId,
        identityKey,
        signedPreKey,
        oneTimePreKeys: oneTimePreKeys.map(k => ({
          keyId: k.keyId,
          publicKey: k.publicKey,
          used: false
        }))
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.sendStatus(204);
  } catch (err) {
    console.error('KeyBundle POST error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * GET /api/keybundle/:userId
 * Отдаём публичные ключи пользователя :userId и помечаем один one-time preKey как использованный.
 */
router.get('/:userId', auth, async (req, res) => {
  const targetId = req.params.userId;

  try {
    const bundle = await KeyBundle.findOne({ userId: targetId }).lean();
    if (!bundle) {
      return res.status(404).json({ msg: 'Key bundle not found' });
    }

    const otp = bundle.oneTimePreKeys.find(k => !k.used);
    if (!otp) {
      return res.status(410).json({ msg: 'No one-time pre-key available' });
    }

    // Помечаем как использованный
    await KeyBundle.updateOne(
      { userId: targetId, 'oneTimePreKeys.keyId': otp.keyId },
      { $set: { 'oneTimePreKeys.$.used': true } }
    );

    res.json({
      identityKey:   bundle.identityKey,
      signedPreKey:  bundle.signedPreKey,
      oneTimePreKey: { keyId: otp.keyId, publicKey: otp.publicKey }
    });
  } catch (err) {
    console.error('KeyBundle GET error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
