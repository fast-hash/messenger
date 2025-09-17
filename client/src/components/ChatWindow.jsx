import React from 'react';

export function ChatWindow({ messages, currentUserId }) {
  const items = Array.isArray(messages) ? messages : [];

  if (items.length === 0) {
    return (
      <div className="messages" data-testid="messages">
        Сообщений пока нет
      </div>
    );
  }

  return (
    <ul className="messages" data-testid="messages">
      {items.map((message) => (
        <li key={message._id || message.id || message.createdAt}>
          <b>{message.senderId === currentUserId ? 'Вы' : 'Собеседник'}:</b>{' '}
          <span>{message.text ?? '…'}</span>
        </li>
      ))}
    </ul>
  );
}
