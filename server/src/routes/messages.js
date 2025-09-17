import { Router } from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import base64Regex from '../util/base64Regex.js';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export default function messagesRouter({ auth, onMessage }) {
  const router = Router();

  router.post('/', auth, async (req, res, next) => {
    try {
      const { chatId, encryptedPayload } = req.body || {};
      if (typeof chatId !== 'string' || !OBJECT_ID_RE.test(chatId)) {
        return res.status(422).json({ error: 'invalid chatId' });
      }
      if (typeof encryptedPayload !== 'string' || !base64Regex.test(encryptedPayload)) {
        return res.status(422).json({ error: 'invalid encryptedPayload' });
      }
      const senderId = req.user?.id;
      if (!senderId) return res.status(401).json({ error: 'unauthenticated' });

      const payload = {
        chatId: new mongoose.Types.ObjectId(chatId),
        senderId: new mongoose.Types.ObjectId(senderId),
        encryptedPayload
      };

      const created = await Message.create(payload);

      if (typeof onMessage === 'function') {
        try {
          onMessage({
            id: created._id.toString(),
            chatId: created.chatId.toString(),
            senderId: created.senderId.toString(),
            encryptedPayload: created.encryptedPayload,
            createdAt: created.createdAt
          });
        } catch (err) {
          req.app?.locals?.logger?.error?.('message.onMessage_failed', err);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:chatId', auth, async (req, res, next) => {
    try {
      const { chatId } = req.params;
      if (typeof chatId !== 'string' || !OBJECT_ID_RE.test(chatId)) {
        return res.status(422).json({ error: 'invalid chatId' });
      }

      const docs = await Message.find({ chatId: new mongoose.Types.ObjectId(chatId) }).sort({ createdAt: 1 }).lean();
      const serialised = docs.map(doc => ({
        id: doc._id.toString(),
        chatId: doc.chatId.toString(),
        senderId: doc.senderId.toString(),
        encryptedPayload: doc.encryptedPayload,
        createdAt: doc.createdAt
      }));

      return res.json(serialised);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
