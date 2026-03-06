import { useState } from 'react'
import { api } from './api'

type Props = { onLogin: (user: { id: number; username: string }) => void }

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = mode === 'login'
        ? await api.auth.login(username, password)
        : await api.auth.register(username, password)
      onLogin(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>PrivateTodo</h1>
        <p className="login-subtitle">Your tasks, private and secure</p>
        <form onSubmit={submit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <button
          type="button"
          className="login-switch"
          onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
        </button>
      </div>
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .login-card {
          width: 100%;
          max-width: 360px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 2rem;
        }
        .login-card h1 {
          margin: 0 0 0.25rem;
          font-size: 1.75rem;
          font-weight: 600;
        }
        .login-subtitle {
          margin: 0 0 1.5rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .login-card form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .login-card input {
          padding: 0.75rem 1rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-size: 1rem;
        }
        .login-card input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .login-error {
          margin: 0;
          color: var(--danger);
          font-size: 0.9rem;
        }
        .login-card button[type="submit"] {
          padding: 0.75rem 1rem;
          background: var(--accent);
          color: white;
          border-radius: var(--radius);
          font-weight: 500;
          font-size: 1rem;
        }
        .login-card button[type="submit"]:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .login-card button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .login-switch {
          margin-top: 1rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .login-switch:hover {
          color: var(--accent);
        }
      `}</style>
    </div>
  )
}
