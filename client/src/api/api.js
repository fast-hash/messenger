// client/src/api/api.js
import { request } from './request';

export const api = {
  /* auth */
  register: data => request('/api/auth/register', 'POST', data),
  login:    data => request('/api/auth/login',    'POST', data),

  /* keys */
  uploadBundle: bundle => request('/api/keybundle', 'POST', bundle),
  getBundle:    uid    => request(`/api/keybundle/${uid}`),

  /* messages */
  sendMessage: data => request('/api/messages', 'POST', data),
  history: (chatId) => request(`/api/messages?chat=${chatId}`)
};
