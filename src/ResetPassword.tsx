import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { api } from './api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const emailParam = searchParams.get('email') ?? ''
  const codeParam = (searchParams.get('code') ?? '').replace(/\D/g, '').slice(0, 6)
  const copyCodeParam = searchParams.get('copyCode') === '1'
  const [email, setEmail] = useState(emailParam)
  const [code, setCode] = useState(codeParam)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState('')

  useEffect(() => {
    if (!codeParam || !copyCodeParam) return
    if (!window.isSecureContext || !navigator.clipboard?.writeText) {
      setCopyFeedback('Code loaded. Copy manually if your browser blocks clipboard access.')
      return
    }
    void navigator.clipboard.writeText(codeParam)
      .then(() => setCopyFeedback('Reset code copied to clipboard.'))
      .catch(() => setCopyFeedback('Code loaded. Copy manually if clipboard access is blocked.'))
  }, [codeParam, copyCodeParam])

  const submit = async (e: React.FormEvent) => {
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

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Reset password</h1>
        <p className="login-subtitle">
          Enter your email, the code we sent you, and your new password.
        </p>
        {copyFeedback && <p className="login-subtitle" style={{ marginTop: '-0.75rem' }}>{copyFeedback}</p>}
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
        <Link to="/forgot" className="login-switch">
          Request a new code
        </Link>
        <Link to="/login" className="login-switch" style={{ marginTop: '0.5rem' }}>
          Back to log in
        </Link>
      </div>
      <style>{resetStyles}</style>
    </div>
  )
}

const resetStyles = `
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
`
