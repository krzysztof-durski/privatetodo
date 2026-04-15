import { useEffect, useState } from 'react'
import { api, type IncomingTabInvite, type Tab } from './api'
import { isConfettiEnabled, setConfettiEnabled } from './confetti'
import type { User } from './App'

type Props = {
  user: User
  tabs: Tab[]
  onBack: () => void
  onUpdate: (user: User) => void
  onDeleteTab: (tab: Tab) => Promise<void>
  onAccountDeleted: () => void
  onInvitesChanged: () => void
  accentPresets: string[]
}

export default function Settings({ user, tabs, onBack, onUpdate, onDeleteTab, onAccountDeleted, onInvitesChanged, accentPresets }: Props) {
  const [accent, setAccent] = useState(user.accent_color ?? '#7c5cff')
  const [confetti, setConfetti] = useState(isConfettiEnabled())
  const [saving, setSaving] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'idle' | 'code'>('idle')
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [invites, setInvites] = useState<IncomingTabInvite[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null)
  const [deleteTabBusyId, setDeleteTabBusyId] = useState<string | null>(null)

  const ownedTabs = tabs.filter((tab) => tab.isOwner)

  const loadInvites = async () => {
    setInvitesLoading(true)
    try {
      const data = await api.invites.list()
      setInvites((data.invites ?? []) as IncomingTabInvite[])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to load invitations')
    } finally {
      setInvitesLoading(false)
    }
  }

  useEffect(() => {
    loadInvites()
  }, [])

  const handleSave = async () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(accent)) return
    setSaving(true)
    try {
      const data = await api.auth.updateSettings(accent)
      onUpdate(data.user as User)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const requestDeleteCode = async () => {
    if (!confirm('Send a confirmation code to your email? This will start the account deletion process.')) return
    setDeleteError('')
    setDeleteLoading(true)
    try {
      await api.auth.requestDeleteAccount()
      setDeleteStep('code')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to send code')
    } finally {
      setDeleteLoading(false)
    }
  }

  const confirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirm('Permanently delete your account and all data? This cannot be undone.')) return
    setDeleteError('')
    setDeleteLoading(true)
    try {
      await api.auth.deleteAccount(deleteCode)
      onAccountDeleted()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete account')
    } finally {
      setDeleteLoading(false)
    }
  }

  const acceptInvite = async (invite: IncomingTabInvite) => {
    if (inviteBusyId) return
    setInviteBusyId(invite.id)
    try {
      await api.invites.accept(invite.id)
      setInvites((prev) => prev.filter((item) => item.id !== invite.id))
      onInvitesChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to accept invitation')
    } finally {
      setInviteBusyId(null)
    }
  }

  const declineInvite = async (invite: IncomingTabInvite) => {
    if (inviteBusyId) return
    setInviteBusyId(invite.id)
    try {
      await api.invites.decline(invite.id)
      setInvites((prev) => prev.filter((item) => item.id !== invite.id))
      onInvitesChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to decline invitation')
    } finally {
      setInviteBusyId(null)
    }
  }

  const handleDeleteTab = async (tab: Tab) => {
    if (!tab.isOwner || deleteTabBusyId) return
    setDeleteTabBusyId(tab.id)
    try {
      await onDeleteTab(tab)
    } finally {
      setDeleteTabBusyId(null)
    }
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h2 className="settings-title">Settings</h2>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <label className="settings-label">Accent colour</label>
          <div className="settings-accent-presets">
            {accentPresets.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`settings-accent-swatch ${accent === hex ? 'active' : ''}`}
                style={{ background: hex }}
                onClick={() => setAccent(hex)}
                aria-label={`Choose ${hex}`}
                title={hex}
              />
            ))}
          </div>
          <div className="settings-accent-custom">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="settings-color-input"
            />
            <input
              type="text"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="settings-color-text"
              placeholder="#7c5cff"
            />
          </div>
          <button
            className="settings-save"
            onClick={handleSave}
            disabled={saving || accent === (user.accent_color ?? '#7c5cff')}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="settings-section">
          <label className="settings-label">Manage tabs</label>
          {tabs.length === 0 ? (
            <p className="settings-description">No tabs yet.</p>
          ) : (
            <ul className="settings-tab-list">
              {tabs.map((tab) => {
                const canDelete = tab.isOwner && ownedTabs.length > 1
                return (
                  <li key={tab.id} className="settings-tab-item">
                    <div>
                      <p className="settings-tab-title">{tab.name}</p>
                      <p className="settings-tab-meta">{tab.isOwner ? 'Owned by you' : `Shared (${tab.accessRole})`}</p>
                    </div>
                    {tab.isOwner ? (
                      <button
                        type="button"
                        className="settings-tab-delete"
                        onClick={() => handleDeleteTab(tab)}
                        disabled={!canDelete || deleteTabBusyId !== null}
                        title={canDelete ? `Delete ${tab.name}` : 'You must keep at least one owned tab'}
                      >
                        {deleteTabBusyId === tab.id ? 'Deleting...' : 'Delete'}
                      </button>
                    ) : (
                      <span className="settings-tab-shared">👥</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="settings-section">
          <label className="settings-label">Tab invitations</label>
          {invitesLoading ? (
            <p className="settings-description">Loading invitations...</p>
          ) : invites.length === 0 ? (
            <p className="settings-description">No pending invitations.</p>
          ) : (
            <ul className="settings-invite-list">
              {invites.map((invite) => (
                <li key={invite.id} className="settings-invite-item">
                  <div>
                    <p className="settings-invite-title">{invite.tabName}</p>
                    <p className="settings-invite-meta">
                      From {invite.ownerEmail} ({invite.role})
                    </p>
                  </div>
                  <div className="settings-invite-actions">
                    <button
                      type="button"
                      className="settings-invite-accept"
                      onClick={() => acceptInvite(invite)}
                      disabled={inviteBusyId !== null}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="settings-invite-decline"
                      onClick={() => declineInvite(invite)}
                      disabled={inviteBusyId !== null}
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="settings-section">
          <label className="settings-label">Celebration</label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={confetti}
              onChange={(e) => {
                const v = e.target.checked
                setConfetti(v)
                setConfettiEnabled(v)
              }}
            />
            <span>Show confetti when completing a task</span>
          </label>
        </div>

        <div className="settings-section settings-danger">
          <label className="settings-label">Delete account</label>
          <p className="settings-description">
            Permanently delete your account and all tasks. This cannot be undone.
          </p>
          {deleteStep === 'idle' ? (
            <button
              type="button"
              className="settings-delete-account"
              onClick={requestDeleteCode}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Sending...' : 'Send confirmation code'}
            </button>
          ) : (
            <form onSubmit={confirmDeleteAccount} className="settings-delete-form">
              <input
                type="text"
                placeholder="Enter 6-digit code"
                value={deleteCode}
                onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
              {deleteError && <p className="settings-delete-error">{deleteError}</p>}
              <div className="settings-delete-actions">
                <button
                  type="button"
                  className="settings-delete-cancel"
                  onClick={() => { setDeleteStep('idle'); setDeleteCode(''); setDeleteError('') }}
                >
                  Cancel
                </button>
                <button type="submit" className="settings-delete-confirm" disabled={deleteLoading || deleteCode.length !== 6}>
                  {deleteLoading ? 'Deleting...' : 'Delete account'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .settings {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .settings-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .settings-header .btn-back {
          color: var(--accent);
          padding: 0.5rem 0;
          background: none;
          border: none;
          cursor: pointer;
        }
        .settings-header .btn-back:hover {
          color: var(--accent-hover);
        }
        .settings-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }
        .settings-content {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }
        .settings-section {
          max-width: 400px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .settings-section:last-child {
          margin-bottom: 0;
        }
        .settings-label {
          display: block;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-muted);
          margin-bottom: 0.75rem;
        }
        .settings-accent-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .settings-accent-swatch {
          width: 2rem;
          height: 2rem;
          border-radius: var(--radius);
          border: 2px solid transparent;
          cursor: pointer;
          padding: 0;
        }
        .settings-accent-swatch:hover {
          transform: scale(1.1);
        }
        .settings-accent-swatch.active {
          border-color: var(--text);
          box-shadow: 0 0 0 2px var(--bg);
        }
        .settings-accent-custom {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-bottom: 1rem;
        }
        .settings-color-input {
          width: 3rem;
          height: 2rem;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
        }
        .settings-color-text {
          flex: 1;
          padding: 0.5rem 0.75rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-family: monospace;
          font-size: 0.9rem;
        }
        .settings-color-text:focus {
          outline: none;
          border-color: var(--accent);
        }
        .settings-save {
          padding: 0.5rem 1rem;
          background: var(--accent);
          color: white;
          border-radius: var(--radius);
          font-weight: 500;
        }
        .settings-save:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .settings-save:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .settings-toggle-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          color: var(--text);
          font-size: 0.95rem;
        }
        .settings-toggle-row input {
          width: 1.25rem;
          height: 1.25rem;
        }
        .settings-invite-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .settings-tab-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .settings-tab-item {
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg-elevated);
          padding: 0.75rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }
        .settings-tab-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .settings-tab-meta {
          margin: 0.25rem 0 0;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        .settings-tab-delete {
          padding: 0.45rem 0.75rem;
          border-radius: var(--radius);
          border: 1px solid var(--danger);
          color: var(--danger);
          background: transparent;
        }
        .settings-tab-delete:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.1);
        }
        .settings-tab-delete:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .settings-tab-shared {
          font-size: 1rem;
          opacity: 0.85;
        }
        .settings-invite-item {
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg-elevated);
          padding: 0.75rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }
        .settings-invite-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .settings-invite-meta {
          margin: 0.25rem 0 0;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        .settings-invite-actions {
          display: flex;
          gap: 0.5rem;
        }
        .settings-invite-accept {
          padding: 0.45rem 0.75rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: white;
        }
        .settings-invite-decline {
          padding: 0.45rem 0.75rem;
          border-radius: var(--radius);
          border: 1px solid var(--danger);
          color: var(--danger);
          background: transparent;
        }
        .settings-danger {
          border-color: rgba(239, 68, 68, 0.35);
        }
        .settings-description {
          margin: 0 0 1rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .settings-delete-account {
          padding: 0.5rem 1rem;
          color: var(--danger);
          border: 1px solid var(--danger);
          border-radius: var(--radius);
          background: transparent;
        }
        .settings-delete-account:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.1);
        }
        .settings-delete-account:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .settings-delete-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .settings-delete-form input {
          padding: 0.5rem 0.75rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-size: 1rem;
        }
        .settings-delete-form input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .settings-delete-error {
          margin: 0;
          color: var(--danger);
          font-size: 0.9rem;
        }
        .settings-delete-actions {
          display: flex;
          gap: 0.75rem;
        }
        .settings-delete-cancel {
          padding: 0.5rem 1rem;
          color: var(--text-muted);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: transparent;
        }
        .settings-delete-cancel:hover {
          color: var(--text);
        }
        .settings-delete-confirm {
          padding: 0.5rem 1rem;
          color: white;
          background: var(--danger);
          border: none;
          border-radius: var(--radius);
        }
        .settings-delete-confirm:hover:not(:disabled) {
          background: #dc2626;
        }
        .settings-delete-confirm:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
