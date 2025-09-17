import { Router } from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import base64Regex from '../util/base64Regex.js';
import { ensureNotReplayed } from '../services/replayGuard.js';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const noop = (_req, _res, next) => next();

export default function messagesRouter({ auth, onMessage } = {}) {
  const router = Router();
  const guard = auth || noop;
  const maxCiphertextLength = Number(process.env.MAX_CIPHERTEXT_B64 || 131072) || 131072;
  const replayTtlSeconds = Number(process.env.REPLAY_TTL_SECONDS || 600) || 600;

  router.post('/', guard, async (req, res, next) => {
    try {
      const { chatId, encryptedPayload } = req.body || {};
      if (typeof chatId !== 'string' || !OBJECT_ID_RE.test(chatId)) {
        return res.status(422).json({ error: 'invalid chatId' });
      }
      if (typeof encryptedPayload !== 'string' || !base64Regex.test(encryptedPayload)) {
        return res.status(422).json({ error: 'invalid encryptedPayload' });
      }
      if (encryptedPayload.length > maxCiphertextLength) {
        return res.status(413).json({ error: 'ciphertext too large' });
      }

      const senderId = req.user?.id;
      if (!senderId) {
        return res.status(401).json({ error: 'unauthenticated' });
      }

      const isMember = await Chat.isMember(chatId, senderId);
      if (!isMember) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { ok: notDuplicate } = await ensureNotReplayed(
        chatId,
        encryptedPayload,
        replayTtlSeconds
      );
      if (!notDuplicate) {
        return res.status(409).json({ error: 'duplicate' });
      }

      const payload = {
        chatId: new mongoose.Types.ObjectId(chatId),
        senderId: new mongoose.Types.ObjectId(senderId),
        encryptedPayload,
      };

      const created = await Message.create(payload);
      const response = {
        id: created._id.toString(),
        chatId: created.chatId.toString(),
        senderId: created.senderId.toString(),
        encryptedPayload: created.encryptedPayload,
        createdAt: created.createdAt,
      };

      if (typeof onMessage === 'function') {
        try {
          onMessage(response);
        } catch (err) {
          req.app?.locals?.logger?.error?.('message.onMessage_failed', err);
        }
      }

      return res.status(200).json({ ok: true, id: response.id });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:chatId', guard, async (req, res, next) => {
    try {
      const { chatId } = req.params;
      if (typeof chatId !== 'string' || !OBJECT_ID_RE.test(chatId)) {
        return res.status(422).json({ error: 'invalid chatId' });
      }

      const requesterId = req.user?.id;
      if (!requesterId) {
        return res.status(401).json({ error: 'unauthenticated' });
      }

      const isMember = await Chat.isMember(chatId, requesterId);
      if (!isMember) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const docs = await Message.find({ chatId: new mongoose.Types.ObjectId(chatId) })
        .sort({ createdAt: 1 })
        .lean();

      const serialised = docs.map((doc) => ({
        id: doc._id.toString(),
        chatId: doc.chatId.toString(),
        senderId: doc.senderId.toString(),
        encryptedPayload: doc.encryptedPayload,
        createdAt: doc.createdAt,
      }));

      return res.json(serialised);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
