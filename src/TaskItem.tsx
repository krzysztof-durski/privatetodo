import { useEffect, useRef, useState } from 'react'
import type { Task } from './api'
import NoteEditor from './NoteEditor'
import NoteIcon from './NoteIcon'

function formatDeadline(deadline: string): string {
  const now = new Date()
  const due = deadline.includes('T') ? new Date(deadline) : new Date(deadline + 'T23:59:59')
  const ms = due.getTime() - now.getTime()
  const absMs = Math.abs(ms)
  const mins = Math.floor(absMs / 60000)
  const hours = Math.floor(absMs / 3600000)
  const days = Math.floor(absMs / 86400000)
  if (ms < 0) {
    if (days >= 1) return `Overdue ${days} day${days === 1 ? '' : 's'} ago`
    if (hours >= 1) return `Overdue ${hours} hour${hours === 1 ? '' : 's'} ago`
    if (mins >= 1) return `Overdue ${mins} min${mins === 1 ? '' : 's'} ago`
    return 'Overdue'
  }
  if (days >= 1) return `Deadline in ${days} day${days === 1 ? '' : 's'}`
  if (hours >= 1) return `Deadline in ${hours} hour${hours === 1 ? '' : 's'}`
  if (mins >= 1) return `Deadline in ${mins} min${mins === 1 ? '' : 's'}`
  return 'Deadline in < 1 min'
}

function isOverdue(deadline: string): boolean {
  if (deadline.includes('T')) {
    return new Date(deadline) < new Date()
  }
  return new Date(deadline + 'T23:59:59') < new Date()
}

function isDeadlineSoon(deadline: string): boolean {
  if (isOverdue(deadline)) return false
  const now = new Date()
  const due = deadline.includes('T') ? new Date(deadline) : new Date(deadline + 'T23:59:59')
  return due.getTime() - now.getTime() < 24 * 60 * 60 * 1000
}

type Props = {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onTextChange: (text: string) => void
  onNoteChange: (note: string) => void
  onNoteSaveNow: (note: string) => void
  onDeadlineChange: (deadline: string | null) => void
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}

export default function TaskItem({ task, onToggle, onDelete, onTextChange, onNoteChange, onNoteSaveNow, onDeadlineChange, dragHandleProps }: Props) {
  const [showNote, setShowNote] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.text)
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const timeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showDeadlinePicker) dateInputRef.current?.focus()
  }, [showDeadlinePicker])

  const startEdit = () => {
    setEditValue(task.text)
    setEditing(true)
  }

  const saveEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.text) {
      onTextChange(trimmed)
    } else {
      setEditValue(task.text)
    }
    setEditing(false)
  }

  const cancelEdit = () => {
    setEditValue(task.text)
    setEditing(false)
  }

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
        {editing ? (
          <input
            className="task-text-edit"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveEdit()
              } else if (e.key === 'Escape') {
                cancelEdit()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            autoFocus
            aria-label="Edit task"
          />
        ) : (
          <span
            className="task-text"
            onClick={startEdit}
            onDoubleClick={startEdit}
            role="button"
            tabIndex={0}
            aria-label="Edit task"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                startEdit()
              }
            }}
          >
            {task.text}
          </span>
        )}
        {showDeadlinePicker ? (
          <div
            className="task-deadline-picker"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowDeadlinePicker(false)
            }}
          >
            <div
              className="task-deadline-date-wrap"
              onClick={() => dateInputRef.current?.showPicker?.()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  dateInputRef.current?.showPicker?.()
                }
              }}
              aria-label="Pick date from calendar"
            >
              <span className="task-deadline-calendar-icon">📅</span>
              <input
                ref={dateInputRef}
                type="date"
                defaultValue={task.deadline?.split('T')[0] ?? new Date().toISOString().slice(0, 10)}
                readOnly
                tabIndex={-1}
                aria-hidden
              />
            </div>
            <input
              ref={timeInputRef}
              type="time"
              defaultValue={task.deadline?.includes('T') ? task.deadline.split('T')[1]?.slice(0, 5) ?? '' : ''}
              title="Time (optional)"
              onBlur={(e) => {
                const v = e.target.value
                if (v && /^\d{1,2}(:\d{0,2})?$/.test(v)) {
                  const [h, m] = v.split(':')
                  if (!m || m === '') {
                    e.target.value = `${h.padStart(2, '0')}:00`
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const date = dateInputRef.current?.value
                  const time = timeInputRef.current?.value
                  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    onDeadlineChange(time && /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : date)
                  } else {
                    onDeadlineChange(null)
                  }
                  setShowDeadlinePicker(false)
                } else if (e.key === 'Escape') {
                  setShowDeadlinePicker(false)
                }
              }}
            />
            <button
              type="button"
              className="task-deadline-done"
              onClick={() => {
                const date = dateInputRef.current?.value
                const time = timeInputRef.current?.value
                if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                  const value = time && /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : date
                  onDeadlineChange(value)
                } else {
                  onDeadlineChange(null)
                }
                setShowDeadlinePicker(false)
              }}
            >
              Done
            </button>
            <button
              type="button"
              className="task-deadline-clear"
              onClick={() => {
                onDeadlineChange(null)
                setShowDeadlinePicker(false)
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <button
            className={`task-deadline-btn ${task.deadline ? 'has-deadline' : ''} ${task.deadline && isOverdue(task.deadline) ? 'overdue' : ''} ${task.deadline && isDeadlineSoon(task.deadline) ? 'soon' : ''}`}
            onClick={() => setShowDeadlinePicker(true)}
            aria-label={task.deadline ? `Deadline: ${formatDeadline(task.deadline)}` : 'Add deadline'}
            title={task.deadline ? `Due ${formatDeadline(task.deadline)}` : 'Add deadline'}
          >
            {task.deadline ? formatDeadline(task.deadline) : '📅'}
          </button>
        )}
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
          cursor: text;
          padding: 0.15rem 0;
          border-radius: 2px;
        }
        .task-text:hover {
          background: var(--bg);
        }
        .task-text:focus {
          outline: none;
        }
        .task-item.completed .task-text {
          text-decoration: line-through;
          color: var(--text-muted);
        }
        .task-text-edit {
          flex: 1;
          padding: 0.15rem 0.25rem;
          background: var(--bg);
          border: 1px solid var(--accent);
          border-radius: var(--radius);
          color: var(--text);
          font-size: inherit;
          font-family: inherit;
        }
        .task-text-edit:focus {
          outline: none;
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
        .task-deadline-btn {
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
          color: var(--text-muted);
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          cursor: pointer;
        }
        .task-deadline-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
        }
        .task-deadline-btn.has-deadline {
          color: var(--accent);
        }
        .task-deadline-btn.overdue {
          color: var(--danger);
          border-color: var(--danger);
          background: rgba(239, 68, 68, 0.15);
          font-weight: bold;
        }
        .task-deadline-btn.soon {
          color: var(--warning);
          border-color: var(--warning);
          background: var(--warning-bg);
          font-weight: bold;
        }
        .task-deadline-picker {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .task-deadline-date-wrap {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.25rem 0.5rem;
          background: var(--bg);
          border: 1px solid var(--accent);
          border-radius: var(--radius);
          cursor: pointer;
        }
        .task-deadline-date-wrap:hover {
          border-color: var(--accent-hover);
        }
        .task-deadline-calendar-icon {
          font-size: 1rem;
        }
        .task-deadline-date-wrap input {
          border: none;
          background: transparent;
          padding: 0;
          font-size: 0.85rem;
          color: var(--text);
          cursor: pointer;
          width: 7rem;
        }
        .task-deadline-picker input[type="time"] {
          padding: 0.25rem 0.5rem;
          font-size: 0.85rem;
          background: var(--bg);
          border: 1px solid var(--accent);
          border-radius: var(--radius);
          color: var(--text);
        }
        .task-deadline-date-wrap input::-webkit-calendar-picker-indicator {
          opacity: 0;
          cursor: pointer;
          width: 100%;
          height: 100%;
        }
        .task-deadline-date-wrap input::-moz-calendar-picker-indicator {
          opacity: 0;
          cursor: pointer;
          width: 100%;
          height: 100%;
        }
        .task-deadline-done {
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: var(--radius);
          cursor: pointer;
        }
        .task-deadline-done:hover {
          background: var(--accent-hover);
        }
        .task-deadline-clear {
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
          color: var(--text-muted);
          background: none;
          border: none;
          cursor: pointer;
        }
        .task-deadline-clear:hover {
          color: var(--danger);
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
