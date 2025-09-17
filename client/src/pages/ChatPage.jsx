import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';

import { AuthContext } from '../contexts/AuthContext';
import { getBundle, sendMessage as sendCiphertext, history as fetchHistory } from '../api/api.js';
import { initSession, decryptMessage } from '../crypto/signal.js';
import { ChatWindow } from '../components/ChatWindow';
import MessageInput from '../components/MessageInput';

export default function ChatPage() {
  const { token, userId, logout } = useContext(AuthContext);
  const { chatId: routeChatId } = useParams();

  const chatId = useMemo(() => routeChatId, [routeChatId]);
  const [messages, setMessages] = useState([]);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSessionReady(false);

    (async () => {
      try {
        const bundle = await getBundle(chatId);
        if (cancelled) return;
        await initSession(chatId, bundle);
        if (!cancelled) {
          setSessionReady(true);
        }
      } catch (err) {
        console.error('Failed to initialise Signal session:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    if (!sessionReady) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const history = await fetchHistory(chatId);
        if (cancelled) return;
        setMessages(history);
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, sessionReady]);

  useEffect(() => {
    if (!token || !sessionReady) return undefined;

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      auth: { token },
    });

    socket.emit('join', chatId);

    const handler = async (message) => {
      try {
        const text = await decryptMessage(message.encryptedPayload);
        setMessages((prev) => [...prev, { ...message, text }]);
      } catch (err) {
        console.error('Failed to decrypt incoming message:', err);
      }
    };

    socket.on('message', handler);

    return () => {
      socket.off('message', handler);
      socket.disconnect();
    };
  }, [chatId, sessionReady, token]);

  const handleSend = async (plainText) => {
    if (!sessionReady || !plainText) return;
    try {
      const { encryptedPayload } = await sendCiphertext(chatId, plainText);
      setMessages((prev) => [
        ...prev,
        {
          chatId,
          senderId: userId,
          encryptedPayload,
          text: plainText,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <button onClick={logout}>Выйти</button>
      <h3>
        Чат <em>{chatId}</em>
      </h3>
      <ChatWindow messages={messages} currentUserId={userId} />
      <MessageInput onSend={handleSend} />
    </div>
  );
}
