import { useEffect, useRef, useState } from 'react'
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
import TaskItem from './TaskItem'

type Props = { tab: Tab; onTabsChange: () => void }

function SortableTaskItem({
  task,
  onToggle,
  onDelete,
  onNoteChange,
  onNoteSaveNow,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onNoteChange: (note: string) => void
  onNoteSaveNow: (note: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

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
        onNoteChange={onNoteChange}
        onNoteSaveNow={onNoteSaveNow}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </li>
  )
}

export default function TaskList({ tab, onTabsChange: _onTabsChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)

  const loadTasks = () => api.tasks.list(tab.id).then((d) => { setTasks(d.tasks); setLoading(false) })

  useEffect(() => {
    setLoading(true)
    loadTasks()
  }, [tab.id])

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
    const text = input.trim()
    if (!text) return
    setInput('')
    try {
      const { task } = await api.tasks.create(tab.id, text)
      setTasks((t) => [...t, task].sort((a, b) => a.order - b.order))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const toggleComplete = async (task: Task) => {
    try {
      await api.tasks.update(task.id, { completed: !task.completed })
      setTasks((t) => t.filter((x) => x.id !== task.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const deleteTask = async (task: Task) => {
    try {
      await api.tasks.delete(task.id)
      setTasks((t) => t.filter((x) => x.id !== task.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const DEBOUNCE_MS = 3000
  const noteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const saveNoteToDb = async (taskId: string, note: string) => {
    try {
      await api.tasks.update(taskId, { note: note || '' })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, note: note || null } : x)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
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

  const reorderTasks = async (newTasks: Task[]) => {
    const prevTasks = [...tasks]
    setTasks(newTasks)
    try {
      await api.tasks.reorder(tab.id, newTasks.map((t) => t.id))
    } catch (e) {
      setTasks(prevTasks)
      alert(e instanceof Error ? e.message : 'Failed to save order')
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
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
          type="text"
          placeholder="Add a task..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={!input.trim() || loading}>Add</button>
      </form>

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
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  onToggle={() => toggleComplete(task)}
                  onDelete={() => deleteTask(task)}
                  onNoteChange={(note) => handleNoteChange(task.id, note)}
                  onNoteSaveNow={(note) => handleNoteSaveNow(task.id, note)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
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
      `}</style>
    </div>
  )
}
