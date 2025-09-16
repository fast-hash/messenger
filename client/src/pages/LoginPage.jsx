import React, { useState, useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'

export default function LoginPage() {
  const { login, error } = useContext(AuthContext)
  const [form, setForm] = useState({ username: '', password: '' })

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async e => {
    e.preventDefault()
    try {
      await login(form)
      // после удачи внутри AuthContext вас отправят в "/"
    } catch (err) {
      console.error(err)
    }
  }

  return (
      <div style={{ maxWidth: 360, margin: '100px auto', padding: 20, border: '1px solid #ccc' }}>
        <h2>Вход</h2>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 10 }}>
            <label>Логин</label><br/>
            <input
                name="username"
                value={form.username}
                onChange={handleChange}
                required
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Пароль</label><br/>
            <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
            />
          </div>
          <button type="submit">Войти</button>
        </form>
      </div>
  )
}
