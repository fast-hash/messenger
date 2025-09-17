import test from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';

let mongod, app, request;

const senderId = new mongoose.Types.ObjectId().toString();
function testAuth(req, _res, next) { req.user = { id: senderId }; next(); }

test('setup', async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp({ authMiddleware: testAuth });
  request = supertest(app);
});

test('401 without auth', async () => {
  const appNoAuth = createApp({ authMiddleware: (_req, _res, next) => next() });
  const reqNoAuth = supertest(appNoAuth);
  const res = await reqNoAuth.post('/api/messages').send({ chatId: '000000000000000000000001', encryptedPayload: 'QUJDRA==' });
  assert.equal(res.statusCode, 401);
});

test('422 invalid chatId', async () => {
  const res = await request.post('/api/messages').send({ chatId: 'not_objectid', encryptedPayload: 'QUJDRA==' });
  assert.equal(res.statusCode, 422);
});

test('422 invalid base64', async () => {
  const res = await request.post('/api/messages').send({ chatId: '000000000000000000000001', encryptedPayload: '💥' });
  assert.equal(res.statusCode, 422);
});

test('teardown', async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
