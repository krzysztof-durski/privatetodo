import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from './api'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.auth.forgotPassword(email)
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.auth.resetPassword(email, code, password)
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'code') {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Reset password</h1>
          <p className="login-subtitle">
            Enter the 6-digit code we sent to {email} and your new password.
          </p>
          <form onSubmit={submitReset}>
            <input
              type="text"
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
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
          <button
            type="button"
            className="login-switch"
            onClick={() => { setStep('email'); setError(''); setCode(''); setPassword('') }}
          >
            Use a different email
          </button>
        </div>
        <style>{forgotStyles}</style>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Forgot password</h1>
        <p className="login-subtitle">
          Enter your email. We&apos;ll send you a code to reset your password.
        </p>
        <form onSubmit={submitEmail}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '...' : 'Send reset code'}
          </button>
        </form>
        <Link to="/login" className="login-switch">
          Back to log in
        </Link>
      </div>
      <style>{forgotStyles}</style>
    </div>
  )
}

const forgotStyles = `
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
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .login-switch:hover {
    color: var(--accent);
  }
`
