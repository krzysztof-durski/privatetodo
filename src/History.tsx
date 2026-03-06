import { useEffect, useState } from 'react'
import { api, type HistoryTask } from './api'
import { formatNoteDisplay } from './noteFormat'

type Props = { onBack: () => void; onRestore: () => void }

function relativeTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (sec < 60) return 'Just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`
  return d.toLocaleDateString()
}

export default function History({ onBack, onRestore }: Props) {
  const [tab, setTab] = useState<'completed' | 'deleted'>('completed')
  const [completed, setCompleted] = useState<HistoryTask[]>([])
  const [deleted, setDeleted] = useState<HistoryTask[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.history.completed().then((d) => setCompleted(d.tasks))
    api.history.deleted().then((d) => setDeleted(d.tasks))
  }, [])

  const restoreCompleted = async (id: string) => {
    try {
      await api.history.restoreCompleted(id)
      setCompleted((t) => t.filter((x) => x.id !== id))
      onRestore()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const moveCompletedToDeleted = async (id: string) => {
    try {
      const task = completed.find((t) => t.id === id)
      await api.history.moveCompletedToDeleted(id)
      setCompleted((t) => t.filter((x) => x.id !== id))
      if (task) setDeleted((d) => [{ ...task, deleted_at: new Date().toISOString() }, ...d])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const restoreDeleted = async (id: string) => {
    try {
      await api.history.restoreDeleted(id)
      setDeleted((t) => t.filter((x) => x.id !== id))
      onRestore()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const permanentlyDelete = async (id: string) => {
    if (!confirm('Permanently delete this task? This cannot be undone.')) return
    try {
      await api.history.permanentlyDelete(id)
      setDeleted((t) => t.filter((x) => x.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const permanentlyDeleteAll = async () => {
    if (!confirm(`Permanently delete all ${deleted.length} deleted tasks? This cannot be undone.`)) return
    try {
      await api.history.permanentlyDeleteAll()
      setDeleted([])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const list = tab === 'completed' ? completed : deleted
  const dateKey = tab === 'completed' ? 'completed_at' : 'deleted_at'

  return (
    <div className="history">
      <div className="history-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div className="history-tabs">
          <button className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>
            Completed
          </button>
          <button className={tab === 'deleted' ? 'active' : ''} onClick={() => setTab('deleted')}>
            Deleted
          </button>
        </div>
        {tab === 'deleted' && deleted.length > 0 && (
          <button className="btn-delete-all" onClick={permanentlyDeleteAll}>
            Delete all ({deleted.length})
          </button>
        )}
      </div>

      <div className="history-list">
        {list.length === 0 ? (
          <p className="history-empty">
            {tab === 'completed' ? 'No completed tasks yet.' : 'No deleted tasks yet.'}
          </p>
        ) : (
          list.map((task) => (
            <div key={task.id} className="history-item">
              <div className="history-row">
                <span className="history-icon">{tab === 'completed' ? '✓' : '×'}</span>
                <span className={`history-text ${tab === 'completed' ? 'strikethrough' : ''}`}>{task.text}</span>
                <span className="history-badge">{task.tab_name}</span>
                <span className="history-time">{relativeTime((task as Record<string, string>)[dateKey] ?? '')}</span>
                {tab === 'completed' ? (
                  <>
                    <button className="history-move-deleted" onClick={() => moveCompletedToDeleted(task.id)}>
                      Move to deleted
                    </button>
                    <button className="history-restore" onClick={() => restoreCompleted(task.id)}>
                      Restore
                    </button>
                  </>
                ) : (
                  <>
                    <button className="history-delete-permanent" onClick={() => permanentlyDelete(task.id)}>
                      Delete
                    </button>
                    <button className="history-restore" onClick={() => restoreDeleted(task.id)}>
                      Restore
                    </button>
                  </>
                )}
              </div>
              {task.note && (
                <>
                  <button className="history-note-toggle" onClick={() => toggleExpand(task.id)}>
                    📝 {expanded.has(task.id) ? 'Hide note' : 'Show note'}
                  </button>
                  {expanded.has(task.id) && (
                    <pre className="history-note">{formatNoteDisplay(task.note)}</pre>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      <style>{`
        .history {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .history-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .btn-back {
          color: var(--text-muted);
          padding: 0.5rem 0;
        }
        .btn-back:hover {
          color: var(--accent);
        }
        .history-tabs {
          display: flex;
          gap: 0.5rem;
        }
        .history-tabs button {
          padding: 0.5rem 1rem;
          color: var(--text-muted);
          border-radius: var(--radius);
        }
        .history-tabs button:hover {
          color: var(--text);
        }
        .history-tabs button.active {
          background: var(--bg-hover);
          color: var(--accent);
        }
        .history-list {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }
        .history-empty {
          color: var(--text-muted);
          text-align: center;
          padding: 3rem 1rem;
        }
        .history-item {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1rem;
          margin-bottom: 0.75rem;
        }
        .history-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .history-icon {
          font-size: 1.25rem;
          color: var(--text-muted);
        }
        .history-text {
          flex: 1;
          min-width: 0;
          word-break: break-word;
        }
        .history-text.strikethrough {
          text-decoration: line-through;
          color: var(--text-muted);
        }
        .history-badge {
          padding: 0.2rem 0.5rem;
          background: var(--bg);
          border-radius: 4px;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .history-time {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .history-move-deleted {
          padding: 0.35rem 0.75rem;
          background: var(--bg);
          color: var(--text-muted);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          font-size: 0.9rem;
        }
        .history-move-deleted:hover {
          color: var(--danger);
          border-color: var(--danger);
        }
        .history-delete-permanent {
          padding: 0.35rem 0.75rem;
          background: transparent;
          color: var(--text-muted);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          font-size: 0.9rem;
        }
        .history-delete-permanent:hover {
          color: var(--danger);
          border-color: var(--danger);
        }
        .btn-delete-all {
          margin-left: auto;
          padding: 0.5rem 1rem;
          color: var(--danger);
          border: 1px solid var(--danger);
          border-radius: var(--radius);
          font-size: 0.9rem;
        }
        .btn-delete-all:hover {
          background: var(--danger);
          color: white;
        }
        .history-restore {
          padding: 0.35rem 0.75rem;
          background: var(--accent);
          color: white;
          border-radius: var(--radius);
          font-size: 0.9rem;
        }
        .history-restore:hover {
          background: var(--accent-hover);
        }
        .history-note-toggle {
          margin-top: 0.5rem;
          font-size: 0.9rem;
          color: var(--text-muted);
        }
        .history-note-toggle:hover {
          color: var(--accent);
        }
        .history-note {
          margin: 0.5rem 0 0;
          padding: 0.75rem;
          background: var(--bg);
          border-radius: var(--radius);
          font-size: 0.9rem;
          white-space: pre-wrap;
          overflow-x: auto;
        }
      `}</style>
    </div>
  )
}
