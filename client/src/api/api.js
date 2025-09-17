// client/src/api/api.js
import { request } from './request.js';
import { encryptMessage, decryptMessage } from '../crypto/signal.js';

export async function getBundle(userId) {
  return request(`/api/keybundle/${userId}`);
}

export async function sendMessage(chatId, plaintext) {
  if (typeof chatId !== 'string') {
    throw new TypeError('chatId must be a string');
  }
  if (typeof plaintext !== 'string' || !plaintext.length) {
    throw new TypeError('plaintext must be a non-empty string');
  }
  const encryptedPayload = await encryptMessage(plaintext);
  await request('/api/messages', 'POST', { chatId, encryptedPayload });
  return { chatId, encryptedPayload };
}

export async function history(chatId) {
  if (typeof chatId !== 'string') {
    throw new TypeError('chatId must be a string');
  }
  const records = await request(`/api/messages/${chatId}`);
  if (!Array.isArray(records)) {
    return [];
  }
  const result = [];
  for (const record of records) {
    if (!record || typeof record.encryptedPayload !== 'string') {
      continue;
    }
    const text = await decryptMessage(record.encryptedPayload);
    result.push({ ...record, text });
  }
  return result;
}

const api = {
  register: data => request('/api/auth/register', 'POST', data),
  login: data => request('/api/auth/login', 'POST', data),
  uploadBundle: bundle => request('/api/keybundle', 'POST', bundle),
  getBundle,
  sendMessage,
  history
};

export { api };
