import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { api } from './api'
import Login from './Login'
import Dashboard from './Dashboard'
import ForgotPassword from './ForgotPassword'
import ResetPassword from './ResetPassword'

export type User = { id: number; username: string; accent_color?: string }

function applyAccent(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const hover = `rgb(${Math.min(255, r + 17)}, ${Math.min(255, g + 17)}, ${Math.min(255, b + 17)})`
  document.documentElement.style.setProperty('--accent', hex)
  document.documentElement.style.setProperty('--accent-hover', hover)
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.auth.me()
      .then((data) => {
        const u = data.user as User
        setUser(u)
        applyAccent(u.accent_color ?? '#7c5cff')
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const onLogin = (u: User) => {
    setUser(u)
    applyAccent(u.accent_color ?? '#7c5cff')
  }
  const onLogout = () => {
    api.auth.logout().finally(() => setUser(null))
  }
  const onUserUpdate = (u: User) => {
    setUser(u)
    applyAccent(u.accent_color ?? '#7c5cff')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  return (
    <BrowserRouter basename="/todo">
      <div className="app-wrapper">
        <div className="app-content">
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={onLogin} />} />
            <Route path="/forgot" element={user ? <Navigate to="/" /> : <ForgotPassword />} />
            <Route path="/reset" element={user ? <Navigate to="/" /> : <ResetPassword />} />
            <Route path="/" element={user ? <Dashboard user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
        <footer className="app-footer">
          Created by <a href="https://codepapa.xyz" target="_blank" rel="noopener noreferrer">codepapa</a>
          {' · '}
          <a href="https://github.com/krzysztof-durski" target="_blank" rel="noopener noreferrer">GitHub</a>
        </footer>
      </div>
    </BrowserRouter>
  )
}
