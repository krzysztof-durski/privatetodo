import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api'

export default function ForgotPassword() {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLink, setResetLink] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResetLink(null)
    setLoading(true)
    try {
      const data = await api.auth.forgotPassword(username)
      if (data.resetLink) {
        const fullLink = window.location.origin + data.resetLink
        setResetLink(fullLink)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const copyLink = () => {
    if (resetLink) {
      navigator.clipboard.writeText(resetLink)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Forgot password</h1>
        <p className="login-subtitle">
          Enter your username. If an account exists, a reset link will appear below.
        </p>
        <form onSubmit={submit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '...' : 'Get reset link'}
          </button>
        </form>
        {resetLink && (
          <div className="reset-link-box">
            <p className="reset-link-label">Copy this link and open it in your browser:</p>
            <div className="reset-link-row">
              <input type="text" readOnly value={resetLink} className="reset-link-input" />
              <button type="button" onClick={copyLink} className="reset-copy-btn">
                Copy
              </button>
            </div>
            <a href={resetLink} className="reset-open-link">Open reset page</a>
          </div>
        )}
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
        .reset-link-box {
          margin-top: 1.5rem;
          padding: 1rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
        }
        .reset-link-label {
          margin: 0 0 0.5rem;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        .reset-link-row {
          display: flex;
          gap: 0.5rem;
        }
        .reset-link-input {
          flex: 1;
          padding: 0.5rem;
          font-size: 0.85rem;
        }
        .reset-copy-btn {
          padding: 0.5rem 0.75rem;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: var(--radius);
          font-size: 0.9rem;
          cursor: pointer;
        }
        .reset-copy-btn:hover {
          background: var(--accent-hover);
        }
        .reset-open-link {
          display: inline-block;
          margin-top: 0.75rem;
          color: var(--accent);
          font-size: 0.9rem;
        }
        .reset-open-link:hover {
          text-decoration: underline;
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
