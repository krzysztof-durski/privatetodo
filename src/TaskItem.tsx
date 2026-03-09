import { useState } from 'react'
import type { Task } from './api'
import NoteEditor from './NoteEditor'
import NoteIcon from './NoteIcon'

type Props = {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onNoteChange: (note: string) => void
  onNoteSaveNow: (note: string) => void
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}

export default function TaskItem({ task, onToggle, onDelete, onNoteChange, onNoteSaveNow, dragHandleProps }: Props) {
  const [showNote, setShowNote] = useState(false)

  return (
    <>
      <div className="task-row">
        <div
          className="task-drag-handle"
          {...dragHandleProps}
          aria-label="Drag to reorder"
        >
          <span className="drag-handle-icon">⋮⋮</span>
        </div>
        <button
          className="task-checkbox"
          onClick={onToggle}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed ? '✓' : ''}
        </button>
        <span className="task-text">{task.text}</span>
        <button
          className={`task-note-btn ${task.note ? 'has-note' : ''}`}
          onClick={() => setShowNote((s) => !s)}
          aria-label={task.note ? 'Toggle note (has content)' : 'Toggle note'}
        >
          <span className="task-note-icon-wrap">
            <NoteIcon size={22} />
            {task.note && (
              <span className="task-note-badge" aria-hidden title="Has note">
                ✓
              </span>
            )}
          </span>
        </button>
        <button className="task-delete" onClick={onDelete} aria-label="Delete">
          ×
        </button>
      </div>
      {showNote && (
        <div className="task-note">
          <NoteEditor
            key={task.id}
            value={task.note || ''}
            onChange={onNoteChange}
            onBlur={onNoteSaveNow}
            onEnterSave={onNoteSaveNow}
            placeholder="Add a note..."
          />
        </div>
      )}
      <style>{`
        .task-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          margin-bottom: 0.5rem;
        }
        .task-item:hover .task-delete {
          opacity: 1;
        }
        .task-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .task-drag-handle {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          margin: -0.25rem 0;
          cursor: grab;
          color: var(--text-muted);
          flex-shrink: 0;
          user-select: none;
        }
        .task-drag-handle:active {
          cursor: grabbing;
        }
        .task-drag-handle:hover {
          color: var(--accent);
        }
        .drag-handle-icon {
          font-size: 1rem;
          letter-spacing: -0.2em;
          user-select: none;
        }
        .task-checkbox {
          width: 1.25rem;
          height: 1.25rem;
          border: 2px solid var(--border);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: white;
          font-size: 0.75rem;
        }
        .task-item:not(.completed) .task-checkbox:hover {
          border-color: var(--accent);
        }
        .task-item.completed .task-checkbox {
          background: var(--success);
          border-color: var(--success);
        }
        .task-text {
          flex: 1;
          word-break: break-word;
        }
        .task-item.completed .task-text {
          text-decoration: line-through;
          color: var(--text-muted);
        }
        .task-note-btn {
          padding: 0.35rem;
          opacity: 0.7;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }
        .task-note-btn.has-note {
          opacity: 1;
        }
        .task-note-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .task-note-badge {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 12px;
          height: 12px;
          background: var(--accent);
          color: white;
          border-radius: 50%;
          font-size: 8px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .task-note-btn:hover {
          opacity: 1;
        }
        .task-delete {
          padding: 0.25rem 0.5rem;
          color: var(--text-muted);
          font-size: 1.25rem;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .task-delete:hover {
          color: var(--danger);
        }
        .task-note {
          margin-left: 2.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border);
        }
      `}</style>
    </>
  )
}
