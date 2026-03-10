import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api'

type Props = { onLogin: (user: { id: number; username: string }) => void }

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [pendingVerify, setPendingVerify] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (pendingVerify) {
        const data = await api.auth.verifyEmail(verificationCode)
        onLogin(data.user)
      } else if (mode === 'login') {
        const data = await api.auth.login(email, password)
        onLogin(data.user)
      } else {
        await api.auth.register(email, password)
        setPendingVerify(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (pendingVerify) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Verify your email</h1>
          <p className="login-subtitle">
            We sent a 6-digit code to {email}. Enter it below.
          </p>
          <form onSubmit={submit}>
            <input
              type="text"
              placeholder="Verification code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? '...' : 'Verify'}
            </button>
          </form>
          <button
            type="button"
            className="login-switch"
            onClick={() => { setPendingVerify(false); setError('') }}
          >
            Use a different email
          </button>
        </div>
        <style>{loginStyles}</style>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Codepapa TODO</h1>
        <p className="login-subtitle">Your tasks, private and secure</p>
        <form onSubmit={submit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
        <div className="login-links">
          <button
            type="button"
            className="login-switch"
            onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }}
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
          </button>
          {mode === 'login' && (
            <Link to="/forgot" className="login-forgot">Forgot password?</Link>
          )}
        </div>
      </div>
      <style>{loginStyles}</style>
    </div>
  )
}

const loginStyles = `
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
  .login-links {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .login-switch {
    color: var(--text-muted);
    font-size: 0.9rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .login-switch:hover {
    color: var(--accent);
  }
  .login-forgot {
    color: var(--text-muted);
    font-size: 0.9rem;
    text-decoration: none;
  }
  .login-forgot:hover {
    color: var(--accent);
  }
`
