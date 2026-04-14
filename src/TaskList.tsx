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
import { fireConfetti } from './confetti'
import TaskItem from './TaskItem'

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
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onTextChange: (text: string) => void
  onNoteChange: (note: string) => void
  onNoteSaveNow: (note: string) => void
  onDeadlineChange: (deadline: string | null) => void
  onMove: () => void
  moveTargets: Tab[]
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
        onTextChange={onTextChange}
        onNoteChange={onNoteChange}
        onNoteSaveNow={onNoteSaveNow}
        onDeadlineChange={onDeadlineChange}
        onMove={onMove}
        moveTargets={moveTargets}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </li>
  )
}

type TaskListProps = { tab: Tab; tabs: Tab[]; onTabsChange: () => void; onTasksChange: () => void }

export default function TaskList({ tab, tabs, onTabsChange, onTasksChange }: TaskListProps) {
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
      // Server bumps existing orders; mirror that so we don't get two order=0 rows (new task would sort 2nd).
      setTasks((prev) => [task, ...prev.map((x) => ({ ...x, order: x.order + 1 }))])
      onTasksChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const toggleComplete = async (task: Task) => {
    const markingComplete = !task.completed
    try {
      await api.tasks.update(task.id, { completed: markingComplete })
      setTasks((t) => t.filter((x) => x.id !== task.id))
      onTasksChange()
      if (markingComplete) fireConfetti()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const deleteTask = async (task: Task) => {
    try {
      await api.tasks.delete(task.id)
      setTasks((t) => t.filter((x) => x.id !== task.id))
      onTasksChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const updateTaskText = async (taskId: string, text: string) => {
    try {
      await api.tasks.update(taskId, { text })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, text } : x)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update')
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

  const updateTaskDeadline = async (taskId: string, deadline: string | null) => {
    try {
      await api.tasks.update(taskId, { deadline })
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, deadline } : x)))
      onTasksChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update deadline')
    }
  }

  const moveTaskToAnotherTab = async (task: Task) => {
    const moveTargets = tabs.filter((t) => t.id !== tab.id)
    if (!moveTargets.length) return
    const message = moveTargets.map((t, i) => `${i + 1}. ${t.name}`).join('\n')
    const choice = prompt(`Move task to which tab?\n${message}`)
    if (!choice) return

    let target = moveTargets.find((t) => t.name.toLowerCase() === choice.trim().toLowerCase())
    if (!target) {
      const index = Number.parseInt(choice, 10)
      if (Number.isInteger(index) && index >= 1 && index <= moveTargets.length) {
        target = moveTargets[index - 1]
      }
    }
    if (!target) {
      alert('Invalid tab selection')
      return
    }

    try {
      await api.tasks.update(task.id, { tabId: target.id })
      setTasks((prev) => prev.filter((x) => x.id !== task.id))
      onTabsChange()
      onTasksChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to move task')
    }
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
                  onMove={() => moveTaskToAnotherTab(task)}
                  moveTargets={tabs.filter((t) => t.id !== tab.id)}
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
