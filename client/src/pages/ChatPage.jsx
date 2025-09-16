import React, { useContext, useEffect, useState } from 'react';
import { useParams }   from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { api }         from '../api/api';
import {
  initSession, encryptMessage, decryptMessage
} from '../crypto/signal.js';
import ChatWindow   from '../components/ChatWindow';
import MessageInput from '../components/MessageInput';
import { io }       from 'socket.io-client';

export default function ChatPage() {
  const { token, userId, logout } = useContext(AuthContext);
  const { theirUserId }          = useParams();

  // одинаковое имя комнаты для обоих участников
  const room = [userId, theirUserId].sort().join('-');

  const [messages, setMessages] = useState([]);
  const [socket,   setSocket]   = useState(null);

  // X3DH
  useEffect(() => {
    initSession(theirUserId).catch(console.error);
  }, [theirUserId]);

  // история
  useEffect(() => {
    api.getMessages(room)
        .then(async raw => {
          const dec = await Promise.all(raw.map(async m => ({
            ...m,
            text: await decryptMessage(theirUserId, m.encryptedPayload)
          })));
          setMessages(dec);
        })
        .catch(console.error);
  }, [room, theirUserId]);

  // WebSocket
  useEffect(() => {
    const s = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      auth: { token }
    });
    setSocket(s);
    s.emit('join', room);

    s.on('message', async msg => {
      const text = await decryptMessage(theirUserId, msg.encryptedPayload);
      setMessages(prev => [...prev, { ...msg, text }]);
    });

    return () => s.disconnect();
  }, [room, token, theirUserId]);

  // отправка
  const handleSend = async plain => {
    const ct = await encryptMessage(theirUserId, plain);
    await api.postMessage({ chatId: room, encryptedPayload: ct });
    // ⛔️ Больше НЕ делаем socket.emit — сервер сам бродкастит после сохранения
  };

  return (
      <div style={{ padding: 20 }}>
        <button onClick={logout}>Выйти</button>
        <h3>Чат с <em>{theirUserId}</em></h3>
        <ChatWindow messages={messages} />
        <MessageInput onSend={handleSend} />
      </div>
  );
}
