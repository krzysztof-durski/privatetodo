import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api, type Tab, type Task } from './api'
import { fireConfetti } from './confetti'
import TaskItem from './TaskItem'
import { useAppDialogs } from './AppDialogs'

function SortableTaskItem({
  task,
  onToggle,
  onDelete,
  onTextChange,
  onNoteChange,
  onNoteSaveNow,
  onDeadlineChange,
  onMove,
  moveTargets,
  moveActionLabel,
  canEdit,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onTextChange: (text: string) => void
  onNoteChange: (note: string) => void
  onNoteSaveNow: (note: string) => void
  onDeadlineChange: (deadline: string | null) => void
  onMove?: () => void
  moveTargets: Tab[]
  moveActionLabel: 'move' | 'copy'
  canEdit: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canEdit })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`task-item ${task.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <TaskItem
        task={task}
        onToggle={onToggle}
        onDelete={onDelete}
        onTextChange={onTextChange}
        onNoteChange={onNoteChange}
        onNoteSaveNow={onNoteSaveNow}
        onDeadlineChange={onDeadlineChange}
        onMove={onMove}
        moveTargets={moveTargets}
        moveActionLabel={moveActionLabel}
        canEdit={canEdit}
        dragHandleProps={canEdit ? { ...attributes, ...listeners } : undefined}
      />
    </li>
  )
}

type TaskListProps = { tab: Tab; tabs: Tab[]; onTabsChange: () => void; onTasksChange: () => void }

export default function TaskList({ tab, tabs, onTabsChange, onTasksChange }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'move' | 'copy'>('move')
  const [pickerTask, setPickerTask] = useState<Task | null>(null)
  const [pickerTargetId, setPickerTargetId] = useState<string>('')
  const [pickerBusy, setPickerBusy] = useState(false)
  const canEdit = tab.accessRole !== 'view'
  const canMoveBetweenTabs = canEdit && tab.isOwner
  const canCopyBetweenTabs = canEdit && !tab.isOwner
  const crossTabTargets = tabs.filter((t) => t.id !== tab.id && t.accessRole !== 'view')
  const { showAlert } = useAppDialogs()
  const noteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const loadTasks = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      try {
        const d = await api.tasks.list(tab.id)
        setTasks((prev) => {
          if (!silent) return d.tasks as Task[]
          const pendingNoteTaskIds = noteTimers.current
          if (pendingNoteTaskIds.size === 0) return d.tasks as Task[]
          // Keep unsaved local note edits while still applying incoming remote changes.
          return (d.tasks as Task[]).map((incoming) => {
            if (!pendingNoteTaskIds.has(incoming.id)) return incoming
            const local = prev.find((task) => task.id === incoming.id)
            return local ? { ...incoming, note: local.note } : incoming
          })
        })
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [tab.id]
  )

  useEffect(() => {
    setLoading(true)
    loadTasks()
  }, [tab.id, loadTasks])

  useEffect(() => {
    return () => {
      noteTimers.current.forEach((t) => clearTimeout(t))
      noteTimers.current.clear()
    }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    const text = input.trim()
    if (!text) return
    setInput('')
    try {
      const { task } = await api.tasks.create(tab.id, text)
      // Server bumps existing orders; mirror that so we don't get two order=0 rows (new task would sort 2nd).
      setTasks((prev) => [task, ...prev.map((x) => ({ ...x, order: x.order + 1 }))])
      onTasksChange()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const toggleComplete = async (task: Task) => {
    if (!canEdit) return
    const markingComplete = !task.completed
    try {
      await api.tasks.update(task.id, { completed: markingComplete })
      setTasks((t) => t.filter((x) => x.id !== task.id))
      onTasksChange()
      if (markingComplete) fireConfetti()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const deleteTask = async (task: Task) => {
    if (!canEdit) return
    try {
      await api.tasks.delete(task.id)
      setTasks((t) => t.filter((x) => x.id !== task.id))
      onTasksChange()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const updateTaskText = async (taskId: string, text: string) => {
    if (!canEdit) return
    try {
      await api.tasks.update(taskId, { text })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, text } : x)))
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  const DEBOUNCE_MS = 3000

  useEffect(() => {
    const syncInterval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      loadTasks({ silent: true })
    }, 3000)
    return () => {
      window.clearInterval(syncInterval)
    }
  }, [loadTasks])

  const saveNoteToDb = async (taskId: string, note: string) => {
    try {
      await api.tasks.update(taskId, { note: note || '' })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, note: note || null } : x)))
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const handleNoteChange = (taskId: string, note: string) => {
    if (!canEdit) return
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
    if (!canEdit) return
    const existing = noteTimers.current.get(taskId)
    if (existing) {
      clearTimeout(existing)
      noteTimers.current.delete(taskId)
    }
    saveNoteToDb(taskId, note)
  }

  const updateTaskDeadline = async (taskId: string, deadline: string | null) => {
    if (!canEdit) return
    try {
      await api.tasks.update(taskId, { deadline })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, deadline } : x)))
      onTasksChange()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to update deadline')
    }
  }

  const openTabPicker = (task: Task, mode: 'move' | 'copy') => {
    if (!crossTabTargets.length) return
    setPickerTask(task)
    setPickerMode(mode)
    setPickerTargetId(crossTabTargets[0]?.id ?? '')
    setPickerOpen(true)
  }

  const runMoveTask = async (task: Task, target: Tab) => {
    try {
      await api.tasks.update(task.id, { tabId: target.id })
      setTasks((prev) => prev.filter((x) => x.id !== task.id))
      onTabsChange()
      onTasksChange()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to move task')
    }
  }

  const runCopyTask = async (task: Task, target: Tab) => {
    try {
      const { task: createdTask } = await api.tasks.create(target.id, task.text, task.deadline ?? undefined)
      if (task.note) {
        await api.tasks.update(createdTask.id, { note: task.note })
      }
      onTabsChange()
      onTasksChange()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to copy task')
    }
  }

  const confirmTabPicker = async () => {
    if (!pickerTask || !pickerTargetId || pickerBusy) return
    const target = crossTabTargets.find((t) => t.id === pickerTargetId)
    if (!target) {
      await showAlert('Invalid tab selection')
      return
    }
    setPickerBusy(true)
    try {
      if (pickerMode === 'move') await runMoveTask(pickerTask, target)
      else await runCopyTask(pickerTask, target)
      setPickerOpen(false)
      setPickerTask(null)
      setPickerTargetId('')
    } finally {
      setPickerBusy(false)
    }
  }

  const reorderTasks = async (newTasks: Task[]) => {
    if (!canEdit) return
    const prevTasks = [...tasks]
    setTasks(newTasks)
    try {
      await api.tasks.reorder(tab.id, newTasks.map((t) => t.id))
    } catch (e) {
      setTasks(prevTasks)
      await showAlert(e instanceof Error ? e.message : 'Failed to save order')
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canEdit) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tasks.findIndex((t) => t.id === active.id)
    const newIndex = tasks.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(tasks, oldIndex, newIndex)
    next.forEach((t, idx) => (t.order = idx))
    reorderTasks(next)
  }

  return (
    <div className="task-list">
      <form className="task-add" onSubmit={addTask}>
        <input
          data-tutorial="task-input"
          type="text"
          placeholder="Add a task..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading || !canEdit}
        />
        <button type="submit" disabled={!input.trim() || loading || !canEdit}>Add</button>
      </form>
      {!canEdit && (
        <p className="task-empty" style={{ paddingTop: 0, marginTop: '-0.5rem' }}>
          View-only tab. Ask the owner for edit access.
        </p>
      )}

      {loading ? (
        <p className="task-empty">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="task-empty">No tasks yet. Add one above!</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul className="tasks">
              {tasks.map((task) => (
                // Pass move targets so each task can expose "move" action.
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  onToggle={() => toggleComplete(task)}
                  onDelete={() => deleteTask(task)}
                  onTextChange={(text) => updateTaskText(task.id, text)}
                  onNoteChange={(note) => handleNoteChange(task.id, note)}
                  onNoteSaveNow={(note) => handleNoteSaveNow(task.id, note)}
                  onDeadlineChange={(deadline) => updateTaskDeadline(task.id, deadline)}
                  onMove={
                    canMoveBetweenTabs
                      ? () => openTabPicker(task, 'move')
                      : canCopyBetweenTabs
                        ? () => openTabPicker(task, 'copy')
                        : undefined
                  }
                  moveTargets={(canMoveBetweenTabs || canCopyBetweenTabs) ? crossTabTargets : []}
                  moveActionLabel={canMoveBetweenTabs ? 'move' : 'copy'}
                  canEdit={canEdit}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {pickerOpen && (
        <div className="tab-picker-backdrop" onClick={() => !pickerBusy && setPickerOpen(false)}>
          <div className="tab-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{pickerMode === 'move' ? 'Move task to tab' : 'Copy task to tab'}</h3>
            <p>Select a destination tab:</p>
            <div className="tab-picker-list">
              {crossTabTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  className={`tab-picker-item ${pickerTargetId === target.id ? 'active' : ''}`}
                  onClick={() => setPickerTargetId(target.id)}
                  disabled={pickerBusy}
                >
                  {target.name}
                </button>
              ))}
            </div>
            <div className="tab-picker-actions">
              <button type="button" className="tab-picker-cancel" onClick={() => setPickerOpen(false)} disabled={pickerBusy}>
                Cancel
              </button>
              <button type="button" className="tab-picker-confirm" onClick={confirmTabPicker} disabled={pickerBusy || !pickerTargetId}>
                {pickerBusy ? 'Working...' : pickerMode === 'move' ? 'Move' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .task-list {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
        }
        .task-add {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        .task-add input {
          flex: 1;
          padding: 0.75rem 1rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-size: 1rem;
        }
        .task-add input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .task-add button {
          padding: 0.75rem 1.25rem;
          background: var(--accent);
          color: white;
          border-radius: var(--radius);
          font-weight: 500;
        }
        .task-add button:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .task-add button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .task-empty {
          color: var(--text-muted);
          text-align: center;
          padding: 3rem 1rem;
        }
        .tasks {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .task-item.dragging {
          opacity: 0.5;
        }
        .tab-picker-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: grid;
          place-items: center;
          z-index: 70;
          padding: 1rem;
        }
        .tab-picker-modal {
          width: min(460px, 100%);
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
        }
        .tab-picker-modal h3 {
          margin: 0 0 0.5rem;
          font-size: 1.05rem;
        }
        .tab-picker-modal p {
          margin: 0;
          color: var(--text-muted);
        }
        .tab-picker-list {
          margin-top: 0.8rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          max-height: 220px;
          overflow-y: auto;
        }
        .tab-picker-item {
          text-align: left;
          padding: 0.55rem 0.7rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          color: var(--text);
          background: transparent;
        }
        .tab-picker-item.active {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 15%, transparent);
        }
        .tab-picker-actions {
          margin-top: 1rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.55rem;
        }
        .tab-picker-cancel {
          border: 1px solid var(--border);
          color: var(--text-muted);
          border-radius: var(--radius);
          padding: 0.45rem 0.75rem;
          background: transparent;
        }
        .tab-picker-confirm {
          border-radius: var(--radius);
          padding: 0.45rem 0.75rem;
          background: var(--accent);
          color: #fff;
        }
      `}</style>
    </div>
  )
}
