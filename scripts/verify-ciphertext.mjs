import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import supertest from 'supertest';

const { createApp, connectMongo } = await import('../server/src/app.js');
const { default: Message } = await import('../server/src/models/Message.js');

const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

async function main() {
  let mongod;
  let exitCode = 0;

  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri('verification-suite');
    await connectMongo(uri);

    const observedBodies = [];
    const authBypass = (req, _res, next) => {
      req.user = { id: new mongoose.Types.ObjectId().toString() };
      next();
    };
    const app = createApp({
      authMiddleware: authBypass,
      messageObserver: (body) => {
        observedBodies.push(JSON.parse(JSON.stringify(body ?? {})));
      }
    });
    const request = supertest(app);

    const plaintextRes = await request.post('/api/messages').send({ text: 'diagnostic-plaintext' });
    if (plaintextRes.statusCode < 400) {
      console.error('Plaintext payload was accepted by the server:', plaintextRes.statusCode);
      exitCode = 1;
    } else {
      console.log('Plaintext payload rejected as expected with status', plaintextRes.statusCode);
    }

    const chatId = new mongoose.Types.ObjectId().toString();
    const ciphertext = { chatId, encryptedPayload: 'QUJDRA==' };
    const cipherRes = await request.post('/api/messages').send(ciphertext);

    if (cipherRes.statusCode >= 400) {
      console.error('Ciphertext payload was rejected:', cipherRes.statusCode, cipherRes.text);
      exitCode = 1;
    }

    const ciphertextBody = observedBodies.find(body => body?.encryptedPayload === ciphertext.encryptedPayload);
    if (!ciphertextBody) {
      console.error('Ciphertext request was not observed by middleware.');
      exitCode = 1;
    } else {
      if (Object.prototype.hasOwnProperty.call(ciphertextBody, 'text') && ciphertextBody.text) {
        console.error('Ciphertext request unexpectedly contained plaintext fields:', ciphertextBody);
        exitCode = 1;
      }
      if (typeof ciphertextBody.encryptedPayload !== 'string' || !BASE64_RE.test(ciphertextBody.encryptedPayload)) {
        console.error('Encrypted payload is not valid base64:', ciphertextBody);
        exitCode = 1;
      }
      if (typeof ciphertextBody.chatId !== 'string') {
        console.error('Ciphertext request missing chatId:', ciphertextBody);
        exitCode = 1;
      }
    }

    const docs = await Message.find({ chatId }).lean();
    if (docs.length !== 1) {
      console.error('Ciphertext document not persisted as expected. Found:', docs.length);
      exitCode = 1;
    } else {
      const [doc] = docs;
      if (doc.encryptedPayload !== ciphertext.encryptedPayload) {
        console.error('Stored encrypted payload does not match request:', doc);
        exitCode = 1;
      }
      if (Object.prototype.hasOwnProperty.call(doc, 'text') && doc.text != null) {
        console.error('Stored document contains plaintext field:', doc);
        exitCode = 1;
      }
    }

    const historyRes = await request.get(`/api/messages/${chatId}`);
    if (historyRes.statusCode !== 200) {
      console.error('History endpoint failed with status', historyRes.statusCode);
      exitCode = 1;
    } else {
      const records = Array.isArray(historyRes.body) ? historyRes.body : [];
      records.forEach(record => {
        if (Object.prototype.hasOwnProperty.call(record, 'text') && record.text != null) {
          console.error('History response leaked plaintext:', record);
          exitCode = 1;
        }
        if (!BASE64_RE.test(record.encryptedPayload ?? '')) {
          console.error('History response contains non-base64 payload:', record);
          exitCode = 1;
        }
      });
    }

    if (exitCode === 0) {
      console.log('Ciphertext verification completed: captured %d request(s).', observedBodies.length);
    }
  } catch (err) {
    console.error('Ciphertext verification failed with exception:', err);
    exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
    if (mongod) {
      await mongod.stop();
    }
  }

  process.exit(exitCode);
}

main();
