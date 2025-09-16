import React, { useState } from 'react';
import { api } from '@/api/api';
import { publishInitialBundle } from '@/crypto/signal';
import { useNavigate } from 'react-router-dom';
import forge from 'node-forge';

export function RegisterPage() {
    const [form, setForm] = useState({ email: '', password: '' });
    const nav = useNavigate();

    const submit = async e => {
        e.preventDefault();
        try {
            // 1. Зарегистрировать на сервере + получить privateKey
            const { privateKey, userId } = await api.registerUser(form);

            // 2. Сгенерировать E2E-бандл
            const bundle = await publishInitialBundle();

            // 3. Отправить бандл на сервер (все поля — строки)
            await api.uploadBundle(bundle);

            // 4. Сохранить приватный RSA-ключ и userId
            sessionStorage.setItem('privateKey', privateKey);
            sessionStorage.setItem('userId', userId);

            // 5. Перейти в чат
            nav(`/chat/${userId}`);
        } catch (err) {
            console.error(err);
            alert('Ошибка регистрации');
        }
    };

    return (
        <form onSubmit={submit}>
            <input
                type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="Email" required
            />
            <input
                type="password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Пароль" required
            />
            <button type="submit">Зарегистрироваться</button>
        </form>
    );
}
