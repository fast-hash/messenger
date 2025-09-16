// client/src/crypto/signal.js
import { Buffer } from 'buffer';
import * as libsignal from 'libsignal-protocol';
import forge from 'node-forge';

/* ---------- примитивное persistent-store ---------- */
const LOCAL_KEY = 'secure-messenger-signal-store';
const store = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');

function save() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

/* ---------- key & session helpers ---------- */
export async function initIdentity() {
    if (store.identityKeyPair && store.registrationId) return;

    store.identityKeyPair = await libsignal.KeyHelper.generateIdentityKeyPair();
    store.registrationId  = await libsignal.KeyHelper.generateRegistrationId();
    save();
}

export async function buildPreKeyBundle() {
    await initIdentity();

    const preKey       = await libsignal.KeyHelper.generatePreKey(1);
    const signedPreKey = await libsignal.KeyHelper.generateSignedPreKey(
        store.identityKeyPair,
        1
    );

    return {
        identityKey: Buffer.from(store.identityKeyPair.pubKey).toString('base64'),
        registrationId: store.registrationId,
        preKey: {
            keyId: 1,
            publicKey: Buffer.from(preKey.keyPair.pubKey).toString('base64')
        },
        signedPreKey: {
            keyId: 1,
            publicKey: Buffer.from(signedPreKey.keyPair.pubKey).toString('base64'),
            signature: Buffer.from(signedPreKey.signature).toString('base64')
        }
    };
}

/* ---------- lib-compatible in-memory store ---------- */
function get(key)  { return store[key]; }
function put(key,v){ store[key] = v; save(); }

export const signalStore = {
    /* identity */
    getIdentityKeyPair: () => get('identityKeyPair'),
    getLocalRegistrationId: () => get('registrationId'),

    /* pre-keys */
    loadPreKey: keyId => get(`25519KeypreKey${keyId}`),
    storePreKey: (keyId, keyPair) => put(`25519KeypreKey${keyId}`, keyPair),

    /* signed pre key */
    loadSignedPreKey: keyId => get(`25519KeysignedKey${keyId}`),
    storeSignedPreKey: (keyId, keyPair) =>
        put(`25519KeysignedKey${keyId}`, keyPair),

    /* session */
    loadSession: id => get(`session${id}`),
    storeSession: (id, s) => put(`session${id}`, s),

    /* identity of contacts */
    isTrustedIdentity: () => true,
    loadIdentityKey: id => get(`identityKey${id}`),
    saveIdentity: (id, identityKey) => put(`identityKey${id}`, identityKey)
};

/* ---------- high-level API ---------- */
export async function initSession(recipientId, theirBundle) {
    const address   = new libsignal.SignalProtocolAddress(recipientId, 1);
    const builder   = new libsignal.SessionBuilder(signalStore, address);

    await builder.processPreKey(theirBundle);
}

export async function encryptMessage(recipientId, text) {
    const address = new libsignal.SignalProtocolAddress(recipientId, 1);
    const cipher  = new libsignal.SessionCipher(signalStore, address);
    const msg     = await cipher.encrypt(
        new TextEncoder().encode(text)
    );
    return msg; // {type, body}
}

export async function decryptMessage(senderId, { type, body }) {
    const address = new libsignal.SignalProtocolAddress(senderId, 1);
    const cipher  = new libsignal.SessionCipher(signalStore, address);

    const bin = type === 3
        ? await cipher.decryptPreKeyWhisperMessage(
            Buffer.from(body, 'base64'),
            'binary'
        )
        : await cipher.decryptWhisperMessage(
            Buffer.from(body, 'base64'),
            'binary'
        );

    return new TextDecoder().decode(bin);
}
