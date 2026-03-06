import { useState } from 'react'
import { api } from './api'
import type { User } from './App'

type Props = {
  user: User
  onBack: () => void
  onUpdate: (user: User) => void
  accentPresets: string[]
}

export default function Settings({ user, onBack, onUpdate, accentPresets }: Props) {
  const [accent, setAccent] = useState(user.accent_color ?? '#7c5cff')
  const [saving, setSaving] = useState(false)

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
      `}</style>
    </div>
  )
}
