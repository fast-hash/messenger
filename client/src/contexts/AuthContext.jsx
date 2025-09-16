import React, { createContext, useState, useEffect } from 'react'
import { jwtDecode } from 'jwt-decode'                  // ← named-export!
import { api, setToken as setApiToken } from '../api/api'
import { useNavigate } from 'react-router-dom'

export const AuthContext = createContext()

export function AuthProvider ({ children }) {
  const [token,   setToken]   = useState(null)
  const [userId,  setUserId]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const navigate = useNavigate()

  // ───── при старте читаем токен
  useEffect(() => {
    const t = localStorage.getItem('token')
    if (t) {
      const { exp, userId: uid } = jwtDecode(t)
      if (Date.now() < exp * 1000) {
        setToken(t)
        setApiToken(t)
        setUserId(uid)
      } else {
        localStorage.removeItem('token')
      }
    }
    setLoading(false)
  }, [])

  const login = async creds => {
    setError('')
    const { token: t, userId: uid } = await api.login(creds)
    localStorage.setItem('token', t)
    setToken(t)
    setApiToken(t)
    setUserId(uid)
    return uid
  }

  const register = async data => {
    setError('')
    const { token: t, userId: uid } = await api.register(data)
    localStorage.setItem('token', t)
    setToken(t)
    setApiToken(t)
    setUserId(uid)
    return uid
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setApiToken(null)
    setUserId(null)
    navigate('/login')
  }

  if (loading) return <div>Загрузка…</div>

  return (
      <AuthContext.Provider value={{ token, userId, error, login, register, logout }}>
        {children}
      </AuthContext.Provider>
  )
}
