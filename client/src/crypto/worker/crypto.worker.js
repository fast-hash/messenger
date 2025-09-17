const globalScope = typeof self !== 'undefined' ? self : globalThis;
if (!globalScope.window) {
  globalScope.window = globalScope;
}

let postMessageImpl;
let addMessageListener;

const environmentReady = (async () => {
  if (typeof globalScope.postMessage === 'function' && typeof globalScope.addEventListener === 'function') {
    postMessageImpl = message => globalScope.postMessage(message);
    addMessageListener = handler => globalScope.addEventListener('message', handler);
  } else {
    const { parentPort } = await import('node:worker_threads');
    postMessageImpl = message => parentPort.postMessage(message);
    addMessageListener = handler => parentPort.on('message', data => handler({ data }));
    if (!globalScope.crypto) {
      const { webcrypto } = await import('node:crypto');
      globalScope.crypto = webcrypto;
    }
  }
})();

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const memoryStore = new Map();
let activeRecipientId = null;
let libsignalPromise = null;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureLibsignal() {
  if (!libsignalPromise) {
    libsignalPromise = (async () => {
      await environmentReady;
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
        const { setupTestLibsignal } = await import('../../../test/libsignal-stub.mjs');
        setupTestLibsignal();
      } else if (typeof importScripts === 'function') {
        importScripts(new URL('../libsignal-protocol.js', import.meta.url).toString());
      } else {
        await import('../libsignal-protocol.js');
      }

      const started = Date.now();
      while (!globalScope.libsignal) {
        if (Date.now() - started > 5000) {
          throw new Error('libsignal runtime did not initialise in worker');
        }
        await wait(10);
      }

      if (!globalScope.signalStore) {
        globalScope.signalStore = memoryStore;
      }

      return globalScope.libsignal;
    })();
  }

  return libsignalPromise;
}

function ensureUint8(view) {
  if (view instanceof Uint8Array) {
    return view;
  }
  if (view instanceof ArrayBuffer) {
    return new Uint8Array(view);
  }
  if (ArrayBuffer.isView(view)) {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  throw new TypeError('Unsupported binary type');
}

function toArrayBuffer(view) {
  const bytes = ensureUint8(view);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function base64EncodeBytes(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof globalScope.btoa === 'function') {
    return globalScope.btoa(binary);
  }

  return Buffer.from(binary, 'binary').toString('base64');
}

function base64DecodeToBytes(str) {
  let binary;
  if (typeof globalScope.atob === 'function') {
    binary = globalScope.atob(str);
  } else {
    binary = Buffer.from(str, 'base64').toString('binary');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64EncodeString(str) {
  if (typeof globalScope.btoa === 'function') {
    const utf8 = textEncoder.encode(str);
    let binary = '';
    for (let i = 0; i < utf8.length; i += 1) {
      binary += String.fromCharCode(utf8[i]);
    }
    return globalScope.btoa(binary);
  }
  return Buffer.from(str, 'utf-8').toString('base64');
}

function base64DecodeToString(str) {
  if (typeof globalScope.atob === 'function') {
    const binary = globalScope.atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return textDecoder.decode(bytes);
  }
  return Buffer.from(str, 'base64').toString('utf-8');
}

function storeValue(key, value) {
  if (value === undefined || value === null) {
    memoryStore.delete(key);
    return;
  }
  memoryStore.set(key, value);
}

function getValue(key) {
  return memoryStore.get(key) ?? null;
}

const signalStore = {
  getIdentityKeyPair: () => getValue('identityKeyPair'),
  setIdentityKeyPair: value => storeValue('identityKeyPair', value),
  getLocalRegistrationId: () => getValue('registrationId'),
  setLocalRegistrationId: value => storeValue('registrationId', value),

  loadPreKey: keyId => getValue(`25519KeypreKey${keyId}`),
  storePreKey: (keyId, keyPair) => storeValue(`25519KeypreKey${keyId}`, keyPair),
  removePreKey: keyId => storeValue(`25519KeypreKey${keyId}`, undefined),

  loadSignedPreKey: keyId => getValue(`25519KeysignedKey${keyId}`),
  storeSignedPreKey: (keyId, keyPair) => storeValue(`25519KeysignedKey${keyId}`, keyPair),
  removeSignedPreKey: keyId => storeValue(`25519KeysignedKey${keyId}`, undefined),

  loadSession: id => getValue(`session${id}`),
  storeSession: (id, session) => storeValue(`session${id}`, session),
  removeSession: id => storeValue(`session${id}`, undefined),

  isTrustedIdentity: () => true,
  loadIdentityKey: id => getValue(`identityKey${id}`),
  saveIdentity: (id, identityKey) => storeValue(`identityKey${id}`, identityKey),
  reset: () => {
    memoryStore.clear();
  }
};

function requireIdentityMaterial() {
  const identityKeyPair = signalStore.getIdentityKeyPair();
  const registrationId = signalStore.getLocalRegistrationId();
  if (!identityKeyPair || !registrationId) {
    throw new Error('Identity keys are not loaded. Generate or load them before using Signal sessions.');
  }
  return { identityKeyPair, registrationId };
}

function ensureActiveRecipient() {
  if (!activeRecipientId) {
    throw new Error('Signal session is not initialised. Call initSession first.');
  }
  return activeRecipientId;
}

function normaliseBundle(input) {
  if (!input) {
    throw new Error('Remote pre-key bundle is required');
  }

  let bundle;
  if (typeof input === 'string') {
    bundle = JSON.parse(base64DecodeToString(input));
  } else if (typeof input === 'object') {
    bundle = input;
  } else {
    throw new TypeError('Unsupported bundle format');
  }

  if (!bundle.identityKey || !bundle.signedPreKey) {
    throw new Error('Pre-key bundle is missing mandatory fields');
  }

  const oneTimePreKey = bundle.preKey || bundle.oneTimePreKey || (Array.isArray(bundle.oneTimePreKeys) ? bundle.oneTimePreKeys[0] : null);
  if (!oneTimePreKey) {
    throw new Error('Pre-key bundle does not contain a pre-key');
  }

  return {
    registrationId: bundle.registrationId || 1,
    identityKey: toArrayBuffer(base64DecodeToBytes(bundle.identityKey)),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: toArrayBuffer(base64DecodeToBytes(bundle.signedPreKey.publicKey)),
      signature: toArrayBuffer(base64DecodeToBytes(bundle.signedPreKey.signature))
    },
    preKey: {
      keyId: oneTimePreKey.keyId,
      publicKey: toArrayBuffer(base64DecodeToBytes(oneTimePreKey.publicKey))
    }
  };
}

function getAddress(libsignal, recipientId) {
  return new libsignal.SignalProtocolAddress(recipientId, 1);
}

function serialiseEnvelope(envelope) {
  return base64EncodeString(JSON.stringify(envelope));
}

function deserialiseEnvelope(serialised) {
  const payload = JSON.parse(base64DecodeToString(serialised));
  if (typeof payload.body !== 'string') {
    throw new Error('Encrypted payload is not base64');
  }
  return payload;
}

async function generateIdentityAndPreKeys() {
  const libsignal = await ensureLibsignal();

  let identityKeyPair = signalStore.getIdentityKeyPair();
  let registrationId = signalStore.getLocalRegistrationId();

  if (!identityKeyPair || !registrationId) {
    identityKeyPair = await libsignal.KeyHelper.generateIdentityKeyPair();
    registrationId = await libsignal.KeyHelper.generateRegistrationId();
    signalStore.setIdentityKeyPair(identityKeyPair);
    signalStore.setLocalRegistrationId(registrationId);
  }

  const preKeyId = 1;
  const signedPreKeyId = 1;

  const preKey = await libsignal.KeyHelper.generatePreKey(preKeyId);
  const signedPreKey = await libsignal.KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);

  signalStore.storePreKey(preKeyId, preKey.keyPair);
  signalStore.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

  const bundle = {
    identityKey: base64EncodeBytes(ensureUint8(identityKeyPair.pubKey)),
    signedPreKey: {
      keyId: signedPreKeyId,
      publicKey: base64EncodeBytes(ensureUint8(signedPreKey.keyPair.pubKey)),
      signature: base64EncodeBytes(ensureUint8(signedPreKey.signature))
    },
    oneTimePreKeys: [
      {
        keyId: preKeyId,
        publicKey: base64EncodeBytes(ensureUint8(preKey.keyPair.pubKey))
      }
    ]
  };

  return {
    bundle,
    identityKeyPair,
    registrationId,
    signedPreKey: {
      keyId: signedPreKeyId,
      keyPair: signedPreKey.keyPair,
      signature: signedPreKey.signature
    },
    oneTimePreKeys: [
      {
        keyId: preKeyId,
        keyPair: preKey.keyPair
      }
    ]
  };
}

async function initSession(recipientId, bundleBase64) {
  const libsignal = await ensureLibsignal();
  requireIdentityMaterial();

  activeRecipientId = recipientId;

  if (!bundleBase64) {
    return null;
  }

  const address = getAddress(libsignal, recipientId);
  const builder = new libsignal.SessionBuilder(signalStore, address);
  const preKeyBundle = normaliseBundle(bundleBase64);
  await builder.processPreKey(preKeyBundle);
  return null;
}

async function encryptMessage(utf8Plaintext) {
  const libsignal = await ensureLibsignal();
  requireIdentityMaterial();
  const recipientId = ensureActiveRecipient();
  const address = getAddress(libsignal, recipientId);
  const cipher = new libsignal.SessionCipher(signalStore, address);

  const message = await cipher.encrypt(textEncoder.encode(utf8Plaintext));
  const body = ensureUint8(message.body);

  const envelope = {
    type: message.type,
    body: base64EncodeBytes(body)
  };

  return serialiseEnvelope(envelope);
}

async function decryptMessage(ciphertextBase64) {
  const libsignal = await ensureLibsignal();
  requireIdentityMaterial();
  const recipientId = ensureActiveRecipient();
  const address = getAddress(libsignal, recipientId);
  const cipher = new libsignal.SessionCipher(signalStore, address);

  const envelope = deserialiseEnvelope(ciphertextBase64);
  const bodyBytes = base64DecodeToBytes(envelope.body);

  const method = envelope.type === 3
    ? 'decryptPreKeyWhisperMessage'
    : 'decryptWhisperMessage';

  const plaintext = await cipher[method](toArrayBuffer(bodyBytes), 'binary');
  return textDecoder.decode(ensureUint8(plaintext));
}

const handlers = {
  async init() {
    await ensureLibsignal();
    return { ok: true };
  },
  async 'store:set'(payload) {
    storeValue(payload.key, payload.value);
    return { ok: true };
  },
  async 'store:remove'(payload) {
    storeValue(payload.key, undefined);
    return { ok: true };
  },
  async 'store:clear'() {
    memoryStore.clear();
    activeRecipientId = null;
    return { ok: true };
  },
  async generateIdentityAndPreKeys() {
    const material = await generateIdentityAndPreKeys();
    return { material };
  },
  async initSession(payload) {
    await initSession(payload.recipientId, payload.bundleBase64);
    return { ok: true };
  },
  async encryptMessage(payload) {
    const ciphertext = await encryptMessage(payload.plaintext);
    return { ciphertext };
  },
  async decryptMessage(payload) {
    const plaintext = await decryptMessage(payload.ciphertext);
    return { plaintext };
  }
};

environmentReady.then(() => {
  addMessageListener(async event => {
    const { id, action, payload } = event.data || {};
    if (typeof id === 'undefined' || !action) {
      return;
    }

    try {
      if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
        throw new Error(`Unknown crypto worker action: ${action}`);
      }
      const result = await handlers[action](payload || {});
      postMessageImpl({ id, result });
    } catch (error) {
      postMessageImpl({ id, error: { message: error.message, name: error.name } });
    }
  });
});
