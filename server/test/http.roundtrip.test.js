import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app.js';
import Message from '../src/models/Message.js';
import { setupTestLibsignal } from '../../client/test/libsignal-stub.mjs';

setupTestLibsignal();

const {
  generateIdentityAndPreKeys,
  initSession,
  resetSignalState
} = await import('../../client/src/crypto/signal.js');
const { sendMessage, history } = await import('../../client/src/api/api.js');

let mongod;
let server;
let baseUrl;
const senderId = new mongoose.Types.ObjectId().toString();

function authStub(req, _res, next) {
  req.user = { id: senderId };
  next();
}

test('setup', async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = createApp({ authMiddleware: authStub });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  globalThis.__API_BASE_URL = baseUrl;
});

test('http round-trip encrypts, stores, and decrypts', async () => {
  resetSignalState();
  const material = await generateIdentityAndPreKeys();
  const recipientId = new mongoose.Types.ObjectId().toString();
  const bundle = {
    identityKey: material.bundle.identityKey,
    signedPreKey: material.bundle.signedPreKey,
    oneTimePreKey: material.bundle.oneTimePreKeys[0]
  };

  await initSession(recipientId, bundle);

  const chatId = new mongoose.Types.ObjectId().toString();
  const plaintext = 'integration ciphertext message';

  await sendMessage(chatId, plaintext);

  const stored = await Message.findOne({ chatId: new mongoose.Types.ObjectId(chatId) }).lean();
  assert.ok(stored, 'message should be stored');
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'text'), false);
  assert.match(stored.encryptedPayload, /^[A-Za-z0-9+/=]+$/);

  const items = await history(chatId);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, plaintext);
  assert.equal(items[0].encryptedPayload, stored.encryptedPayload);
});

test('teardown', async () => {
  delete globalThis.__API_BASE_URL;
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
});
