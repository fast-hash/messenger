import React, { useEffect, useState } from 'react';
import { api } from '@/api/api';
import {
  initSession,
  encryptMessage,
  decryptMessage
} from '@/crypto/signal';

export function ChatWindow({ theirUserId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  // Инициализация сессии
  useEffect(() => {
    (async () => {
      try {
        const theirBundle = await api.getKeyBundle(theirUserId);
        await initSession(theirBundle, theirUserId);
      } catch (e) {
        console.error('Session init failed:', e);
      }
    })();
  }, [theirUserId]);

  // Загрузка истории
  useEffect(() => {
    api.fetchMessages('general')
        .then(setMessages)
        .catch(console.error);
  }, []);

  const send = async () => {
    if (!text) return;
    try {
      const ct = await encryptMessage(theirUserId, text);
      const payloadString = JSON.stringify({
        type: ct.type,
        body: Array.from(ct.body) // преобразуем Uint8Array в массив чисел
      });
      await api.postMessage({
        chatId: 'general',
        encryptedPayload: payloadString
      });
      setText('');
      // тут можно обновить локальные сообщения авто­обновлением
    } catch (err) {
      console.error('Encrypt/send failed:', err);
    }
  };

  const renderMessages = () => messages.map(m => {
    // парсим обратно
    const payload = JSON.parse(m.encryptedPayload);
    return (
        <div key={m._id}>
          <b>{m.senderId === theirUserId ? 'Собеседник' : 'Вы'}:</b>
          {/** Дешифруем на лету */}
          <MessageDecryptor
              theirUserId={m.senderId}
              payload={payload}
          />
        </div>
    );
  });

  return (
      <div>
        <div className="messages">{renderMessages()}</div>
        <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Написать сообщение..."
        />
        <button onClick={send}>Отправить</button>
      </div>
  );
}

function MessageDecryptor({ theirUserId, payload }) {
  const [plain, setPlain] = useState('…');
  useEffect(() => {
    (async () => {
      try {
        const txt = await decryptMessage(theirUserId, payload);
        setPlain(txt);
      } catch (e) {
        console.error('Decrypt failed:', e);
      }
    })();
  }, [payload, theirUserId]);
  return <span>{plain}</span>;
}
