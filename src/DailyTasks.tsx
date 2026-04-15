import { useEffect, useMemo, useState } from 'react'
import { api, type DailyTask } from './api'
import { useAppDialogs } from './AppDialogs'

type Props = {
  onBack: () => void
  onStatusChange?: () => void
}

type DailyStats = {
  summary: { totalTasks: number; completedToday: number; completionRateToday: number }
  byDay: { day: string; completed: number }[]
  byTask: { id: string; text: string; completedDays: number }[]
}

function localDay(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DailyTasks({ onBack, onStatusChange }: Props) {
  const [view, setView] = useState<'tasks' | 'status'>('tasks')
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [selectedDay, setSelectedDay] = useState(localDay())
  const [selectedDayTasks, setSelectedDayTasks] = useState<DailyTask[]>([])
  const [loadingDayTasks, setLoadingDayTasks] = useState(false)
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const { showAlert, showConfirm } = useAppDialogs()

  const loadTasks = () =>
    api.daily.list().then((d) => {
      setTasks(d.tasks)
      setLoading(false)
    })

  const loadStats = () =>
    api.daily.stats(30).then((d) => {
      setStats(d)
    })

  const loadSelectedDayTasks = (day: string) => {
    setLoadingDayTasks(true)
    api.daily.list(day)
      .then((d) => setSelectedDayTasks(d.tasks))
      .finally(() => setLoadingDayTasks(false))
  }

  useEffect(() => {
    setLoading(true)
    loadTasks()
    loadStats()
    loadSelectedDayTasks(selectedDay)
  }, [])

  useEffect(() => {
    if (view === 'status') loadSelectedDayTasks(selectedDay)
  }, [view, selectedDay])

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    try {
      const { task } = await api.daily.create(value)
      setTasks((prev) => [...prev, task])
      setText('')
      loadStats()
      onStatusChange?.()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const toggleDone = async (task: DailyTask) => {
    try {
      await api.daily.setCompleted(task.id, !task.completedToday)
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completedToday: !t.completedToday } : t)))
      loadStats()
      onStatusChange?.()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const removeTask = async (task: DailyTask) => {
    if (!await showConfirm(`Delete "${task.text}" daily task?`, { title: 'Delete daily task', confirmText: 'Delete' })) return
    try {
      await api.daily.remove(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      loadStats()
      onStatusChange?.()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const completedCount = useMemo(() => tasks.filter((t) => t.completedToday).length, [tasks])

  const toggleDoneForSelectedDay = async (task: DailyTask) => {
    try {
      await api.daily.setCompleted(task.id, !task.completedToday, selectedDay)
      setSelectedDayTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completedToday: !t.completedToday } : t)))
      if (selectedDay === localDay()) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completedToday: !t.completedToday } : t)))
        onStatusChange?.()
      }
      loadStats()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="daily-page">
      <div className="daily-head">
        <button className="daily-back" onClick={onBack}>Back</button>
        <h2>Daily Tasks</h2>
      </div>
      <div className="daily-switch">
        <button className={view === 'tasks' ? 'active' : ''} onClick={() => setView('tasks')}>Tasks</button>
        <button className={view === 'status' ? 'active' : ''} onClick={() => setView('status')}>Status</button>
      </div>

      {view === 'tasks' ? (
        <>
          <form className="daily-add" onSubmit={addTask}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add daily task..." maxLength={500} />
            <button type="submit">Add</button>
          </form>
          <p className="daily-summary">Today: {completedCount}/{tasks.length} completed</p>
          {loading ? (
            <p className="daily-empty">Loading...</p>
          ) : tasks.length === 0 ? (
            <p className="daily-empty">No daily tasks yet.</p>
          ) : (
            <ul className="daily-list">
              {tasks.map((task) => (
                <li key={task.id} className={task.completedToday ? 'done' : ''}>
                  <label>
                    <input type="checkbox" checked={task.completedToday} onChange={() => toggleDone(task)} />
                    <span>{task.text}</span>
                  </label>
                  <button onClick={() => removeTask(task)}>×</button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="daily-status">
          {!stats ? (
            <p className="daily-empty">Loading stats...</p>
          ) : (
            <>
              <p className="daily-summary">
                Last 30 days - today completion: {stats.summary.completedToday}/{stats.summary.totalTasks} ({stats.summary.completionRateToday}%)
              </p>
              <h3>Edit day</h3>
              <div className="daily-day-picker">
                <input
                  type="date"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  max={localDay()}
                />
              </div>
              {loadingDayTasks ? (
                <p className="daily-empty">Loading day tasks...</p>
              ) : selectedDayTasks.length === 0 ? (
                <p className="daily-empty">No daily tasks for selected day.</p>
              ) : (
                <ul className="daily-list">
                  {selectedDayTasks.map((task) => (
                    <li key={task.id} className={task.completedToday ? 'done' : ''}>
                      <label>
                        <input type="checkbox" checked={task.completedToday} onChange={() => toggleDoneForSelectedDay(task)} />
                        <span>{task.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <h3>Completions by day</h3>
              <ul className="daily-stats-list">
                {stats.byDay.map((d) => (
                  <li key={d.day}>
                    <span>{d.day}</span>
                    <strong>{d.completed}</strong>
                  </li>
                ))}
              </ul>
              <h3>Completions by task</h3>
              <ul className="daily-stats-list">
                {stats.byTask.map((t) => (
                  <li key={t.id}>
                    <span>{t.text}</span>
                    <strong>{t.completedDays}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <style>{`
        .daily-page { flex: 1; padding: 1.5rem; overflow-y: auto; }
        .daily-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
        .daily-head h2 { margin: 0; font-size: 1.25rem; }
        .daily-back { color: var(--text-muted); }
        .daily-back:hover { color: var(--accent); }
        .daily-switch { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .daily-switch button { padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-muted); }
        .daily-switch button.active { color: var(--accent); border-color: var(--accent); }
        .daily-add { display: flex; gap: 0.75rem; margin-bottom: 0.75rem; }
        .daily-add input { flex: 1; padding: 0.65rem 0.9rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); }
        .daily-add button { padding: 0.65rem 1rem; background: var(--accent); color: #fff; border-radius: var(--radius); }
        .daily-summary { color: var(--text-muted); margin: 0 0 0.75rem; font-size: 0.9rem; }
        .daily-empty { color: var(--text-muted); }
        .daily-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
        .daily-list li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-elevated); }
        .daily-list li.done span { text-decoration: line-through; color: var(--text-muted); }
        .daily-list label { display: flex; align-items: center; gap: 0.6rem; flex: 1; }
        .daily-list button { color: var(--text-muted); font-size: 1.1rem; }
        .daily-list button:hover { color: var(--danger); }
        .daily-status h3 { margin: 1rem 0 0.5rem; font-size: 1rem; }
        .daily-day-picker { margin-bottom: 0.75rem; }
        .daily-day-picker input { padding: 0.45rem 0.55rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); }
        .daily-stats-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-elevated); }
        .daily-stats-list li { display: flex; justify-content: space-between; padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--border); }
        .daily-stats-list li:last-child { border-bottom: none; }
      `}</style>
    </div>
  )
}
