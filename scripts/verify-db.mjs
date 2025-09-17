import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/secure_messenger';
const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

async function connectWithFallback() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.asPromise();
    return null;
  } catch (err) {
    console.warn('DB connection failed, falling back to in-memory instance:', err.message);
    const mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('secure_messenger_check'));
    await mongoose.connection.asPromise();
    return mongod;
  }
}

async function main() {
  let mongod;
  try {
    mongod = await connectWithFallback();

    const collection = mongoose.connection.collection('messages');
    const docs = await collection.find({}).limit(10).toArray();

    if (docs.length === 0) {
      console.warn('DB WARN: no messages found to verify.');
    }

    for (const doc of docs) {
      if (typeof doc.encryptedPayload !== 'string' || !BASE64_RE.test(doc.encryptedPayload)) {
        throw new Error(`Invalid encryptedPayload in document ${doc._id}`);
      }
      if (Object.prototype.hasOwnProperty.call(doc, 'text') && doc.text != null) {
        throw new Error(`Plaintext field detected in document ${doc._id}`);
      }
    }

    console.log('DB OK: ciphertext-only, no plaintext fields.');
    process.exit(0);
  } catch (err) {
    console.error('DB verification failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
    if (mongod) {
      await mongod.stop();
    }
  }
}

main();
