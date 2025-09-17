import React from 'react';

export function ChatWindow({ messages, currentUserId }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return <div className="messages">Сообщений пока нет</div>;
  }

  return (
    <div className="messages">
      {messages.map(message => (
        <div key={message._id || message.id}>
          <b>{message.senderId === currentUserId ? 'Вы' : 'Собеседник'}:</b>{' '}
          <span>{message.text ?? '…'}</span>
        </div>
      ))}
    </div>
  );
}
