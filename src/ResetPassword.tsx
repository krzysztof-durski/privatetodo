import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { api } from './api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.auth.resetPassword(token, password)
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Invalid reset link</h1>
          <p className="login-subtitle">
            This password reset link is invalid or missing. Please request a new one.
          </p>
          <Link to="/forgot" className="login-switch">
            Request new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Reset password</h1>
        <p className="login-subtitle">Enter your new password below.</p>
        <form onSubmit={submit}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '...' : 'Reset password'}
          </button>
        </form>
        <Link to="/login" className="login-switch">
          Back to log in
        </Link>
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
          display: block;
          margin-top: 1rem;
          color: var(--text-muted);
          font-size: 0.9rem;
          text-decoration: none;
        }
        .login-switch:hover {
          color: var(--accent);
        }
      `}</style>
    </div>
  )
}
