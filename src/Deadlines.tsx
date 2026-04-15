import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Tab, type Task } from './api'
import TaskItem from './TaskItem'
import { useAppDialogs } from './AppDialogs'

type TaskWithTab = Task & { tabName: string }

function parseDeadlineTime(d: string): number {
  if (d.includes('T')) return new Date(d).getTime()
  return new Date(d + 'T00:00:00').getTime()
}

type Props = { tabs: Tab[]; onBack: () => void; onRefresh: () => void }

export default function Deadlines({ tabs, onBack, onRefresh }: Props) {
  const [tasks, setTasks] = useState<TaskWithTab[]>([])
  const [loading, setLoading] = useState(true)
  const noteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const DEBOUNCE_MS = 3000
  const { showAlert } = useAppDialogs()

  const loadTasks = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all(tabs.map((tab) => api.tasks.list(tab.id)))
    const withTabs: TaskWithTab[] = []
    results.forEach((d, i) => {
      const tabName = tabs[i]?.name ?? ''
      d.tasks.forEach((t: Task) => {
        if (t.deadline) {
          withTabs.push({ ...t, tabName })
        }
      })
    })
    withTabs.sort((a, b) => parseDeadlineTime(a.deadline!) - parseDeadlineTime(b.deadline!))
    setTasks(withTabs)
    setLoading(false)
  }, [tabs])

  useEffect(() => {
    if (tabs.length) {
      loadTasks()
    } else {
      setLoading(false)
      setTasks([])
    }
  }, [loadTasks, tabs.length])

  useEffect(() => {
    return () => {
      noteTimers.current.forEach((t) => clearTimeout(t))
      noteTimers.current.clear()
    }
  }, [])

  const toggleComplete = async (task: Task) => {
    try {
      await api.tasks.update(task.id, { completed: !task.completed })
      setTasks((t) => t.filter((x) => x.id !== task.id))
      onRefresh()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const deleteTask = async (task: Task) => {
    try {
      await api.tasks.delete(task.id)
      setTasks((t) => t.filter((x) => x.id !== task.id))
      onRefresh()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const updateTaskText = async (taskId: string, text: string) => {
    try {
      await api.tasks.update(taskId, { text })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, text } : x)))
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  const saveNoteToDb = async (taskId: string, note: string) => {
    try {
      await api.tasks.update(taskId, { note: note || '' })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, note: note || null } : x)))
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const handleNoteChange = (taskId: string, note: string) => {
    setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, note: note || null } : x)))
    const existing = noteTimers.current.get(taskId)
    if (existing) clearTimeout(existing)
    noteTimers.current.delete(taskId)
    if (note.trim()) {
      const timer = setTimeout(() => {
        noteTimers.current.delete(taskId)
        saveNoteToDb(taskId, note)
      }, DEBOUNCE_MS)
      noteTimers.current.set(taskId, timer)
    }
  }

  const handleNoteSaveNow = (taskId: string, note: string) => {
    const existing = noteTimers.current.get(taskId)
    if (existing) {
      clearTimeout(existing)
      noteTimers.current.delete(taskId)
    }
    saveNoteToDb(taskId, note)
  }

  const updateTaskDeadline = async (taskId: string, deadline: string | null) => {
    try {
      await api.tasks.update(taskId, { deadline })
      if (deadline) {
        setTasks((t) => {
          const updated = t.map((x) => (x.id === taskId ? { ...x, deadline } : x))
          return updated.sort((a, b) => parseDeadlineTime(a.deadline!) - parseDeadlineTime(b.deadline!))
        })
      } else {
        setTasks((t) => t.filter((x) => x.id !== taskId))
      }
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to update deadline')
    }
  }

  return (
    <div className="deadlines">
      <div className="deadlines-header">
        <button className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <h2 className="deadlines-title">Deadlines</h2>
      </div>

      <div className="deadlines-content">
        {loading ? (
          <p className="deadlines-empty">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="deadlines-empty">No tasks with deadlines.</p>
        ) : (
          <ul className="deadlines-list">
            {tasks.map((task) => (
              <li key={task.id} className={`task-item deadlines-item ${task.completed ? 'completed' : ''}`}>
                <div className="deadlines-task-main">
                  <TaskItem
                    task={task}
                    onToggle={() => toggleComplete(task)}
                    onDelete={() => deleteTask(task)}
                    onTextChange={(text) => updateTaskText(task.id, text)}
                    onNoteChange={(note) => handleNoteChange(task.id, note)}
                    onNoteSaveNow={(note) => handleNoteSaveNow(task.id, note)}
                    onDeadlineChange={(deadline) => updateTaskDeadline(task.id, deadline)}
                    dragHandleProps={{ style: { display: 'none' } }}
                  />
                </div>
                <span className="deadlines-tab-badge">{task.tabName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        .deadlines {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .deadlines-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .btn-back {
          color: var(--text-muted);
          padding: 0.5rem 0;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1rem;
        }
        .btn-back:hover {
          color: var(--accent);
        }
        .deadlines-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }
        .deadlines-content {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
        }
        .deadlines-empty {
          color: var(--text-muted);
          text-align: center;
          padding: 3rem 1rem;
        }
        .deadlines-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .deadlines-list .task-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          margin-bottom: 0.5rem;
        }
        .deadlines-item {
          flex-direction: column;
          gap: 0.25rem;
        }
        .deadlines-task-main {
          flex: 1;
        }
        .deadlines-tab-badge {
          align-self: flex-end;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  )
}
