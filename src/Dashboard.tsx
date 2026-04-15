import { useCallback, useEffect, useState } from 'react'
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
import { api, type Tab, type TabAccessEntry, type TabInviteEntry, type Task } from './api'
import type { User } from './App'
import TaskList from './TaskList'
import History from './History'
import Settings from './Settings'
import Deadlines from './Deadlines'
import DailyTasks from './DailyTasks'

type Props = { user: User; onLogout: () => void; onUserUpdate: (user: User) => void }

function SortableTab({
  tab,
  isActive,
  onSelect,
  onRename,
  onDelete,
  canDelete,
  canDrag,
}: {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onRename: () => void
  onDelete: (e: React.MouseEvent) => void
  canDelete: boolean
  canDrag: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id, disabled: !canDrag })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tab ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={onSelect}
      onDoubleClick={onRename}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
    >
      <span className="tab-name">
        {tab.name}
        {!tab.isOwner ? <span className="tab-badge">{tab.accessRole}</span> : null}
      </span>
      {canDelete && (
        <button
          className="tab-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(e) }}
          aria-label="Delete tab"
        >
          ×
        </button>
      )}
    </div>
  )
}

const ACCENT_PRESETS = [
  '#7c5cff', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6',
  '#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444',
  '#ec4899', '#a855f7',
]

function activeTabStorageKey(userId: number) {
  return `privatetodo:activeTab:${userId}`
}

export default function Dashboard({ user, onLogout, onUserUpdate }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDeadlines, setShowDeadlines] = useState(false)
  const [showDailyTasks, setShowDailyTasks] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [deadlineUrgency, setDeadlineUrgency] = useState<'none' | 'soon' | 'critical'>('none')
  const [accessBusy, setAccessBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMembers, setShareMembers] = useState<TabAccessEntry[]>([])
  const [shareInvites, setShareInvites] = useState<TabInviteEntry[]>([])
  const [shareEmail, setShareEmail] = useState('')
  const [shareRole, setShareRole] = useState<'edit' | 'view'>('view')
  const [shareError, setShareError] = useState('')
  const [shareMessage, setShareMessage] = useState('')

  const loadTabs = useCallback(
    () =>
      api.tabs.list().then((d) => {
        setTabs(d.tabs)
        if (!d.tabs.length) {
          setActiveTab(null)
          return
        }
        const stored = localStorage.getItem(activeTabStorageKey(user.id))
        const match = stored ? d.tabs.find((t: Tab) => t.id === stored) : undefined
        setActiveTab(match ?? d.tabs[0])
      }),
    [user.id]
  )

  const refreshDeadlineUrgency = useCallback(async () => {
    if (!tabs.length) {
      setDeadlineUrgency('none')
      return
    }
    try {
      const results = await Promise.all(tabs.map((tab) => api.tasks.list(tab.id)))
      const now = Date.now()
      let hasSoon = false
      let hasCritical = false

      results.forEach((result) => {
        result.tasks.forEach((task: Task) => {
          if (!task.deadline) return
          const deadlineMs = new Date(task.deadline.includes('T') ? task.deadline : `${task.deadline}T00:00:00`).getTime()
          const diffMs = deadlineMs - now
          if (diffMs <= 12 * 60 * 60 * 1000) hasCritical = true
          else if (diffMs <= 24 * 60 * 60 * 1000) hasSoon = true
        })
      })

      if (hasCritical) setDeadlineUrgency('critical')
      else if (hasSoon) setDeadlineUrgency('soon')
      else setDeadlineUrgency('none')
    } catch {
      setDeadlineUrgency('none')
    }
  }, [tabs])

  useEffect(() => {
    loadTabs()
  }, [loadTabs])

  useEffect(() => {
    if (activeTab) localStorage.setItem(activeTabStorageKey(user.id), activeTab.id)
  }, [activeTab, user.id])

  useEffect(() => {
    if (tabs.length && !activeTab) setActiveTab(tabs[0])
    if (tabs.length && activeTab && !tabs.find((t) => t.id === activeTab.id)) setActiveTab(tabs[0])
  }, [tabs, activeTab])

  useEffect(() => {
    refreshDeadlineUrgency()
    const intervalId = setInterval(refreshDeadlineUrgency, 60 * 1000)
    return () => {
      clearInterval(intervalId)
    }
  }, [refreshDeadlineUrgency])

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      refreshDeadlineUrgency()
    }
    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
    }
  }, [refreshDeadlineUrgency])

  const handleDataRefresh = useCallback(() => {
    loadTabs()
    refreshDeadlineUrgency()
  }, [loadTabs, refreshDeadlineUrgency])

  const addTab = async () => {
    const name = prompt('Tab name:')
    if (!name?.trim()) return
    try {
      const { tab } = await api.tabs.create(name.trim())
      setTabs((t) => [...t, tab].sort((a, b) => a.order - b.order))
      setActiveTab(tab)
      setShowDeadlines(false)
      setShowDailyTasks(false)
      setShowHistory(false)
      setShowSettings(false)
      setMobileMenu(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const loadShareData = useCallback(async (tabId: string) => {
    const data = await api.tabs.accessList(tabId)
    setShareMembers(data.members as TabAccessEntry[])
    setShareInvites(data.invites as TabInviteEntry[])
  }, [])

  const openShareModal = async (tab: Tab) => {
    if (!tab.isOwner || accessBusy) return
    setAccessBusy(true)
    setShareError('')
    setShareMessage('')
    try {
      await loadShareData(tab.id)
      setShareOpen(true)
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to open sharing')
    } finally {
      setAccessBusy(false)
    }
  }

  const inviteToTab = async () => {
    if (!activeTab?.isOwner || accessBusy) return
    const email = shareEmail.trim()
    if (!email) {
      setShareError('Email is required')
      return
    }
    setAccessBusy(true)
    setShareError('')
    setShareMessage('')
    try {
      await api.tabs.invite(activeTab.id, email, shareRole)
      setShareEmail('')
      setShareMessage(`Invitation sent to ${email}`)
      await loadShareData(activeTab.id)
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setAccessBusy(false)
    }
  }

  const changeAccessRole = async (entry: TabAccessEntry | TabInviteEntry, role: 'edit' | 'view') => {
    if (!activeTab?.isOwner || accessBusy) return
    setAccessBusy(true)
    setShareError('')
    setShareMessage('')
    try {
      await api.tabs.updateAccess(activeTab.id, entry.id, role)
      await loadShareData(activeTab.id)
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to update role')
    } finally {
      setAccessBusy(false)
    }
  }

  const removeAccess = async (entry: TabAccessEntry | TabInviteEntry) => {
    if (!activeTab?.isOwner || accessBusy) return
    setAccessBusy(true)
    setShareError('')
    setShareMessage('')
    try {
      await api.tabs.removeAccess(activeTab.id, entry.id)
      await loadShareData(activeTab.id)
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to remove access')
    } finally {
      setAccessBusy(false)
    }
  }

  const leaveSharedTab = async (tab: Tab) => {
    if (tab.isOwner) return
    if (!confirm(`Leave shared tab "${tab.name}"?`)) return
    try {
      await api.tabs.leave(tab.id)
      await loadTabs()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to leave tab')
    }
  }

  const renameTab = async (tab: Tab) => {
    const name = prompt('Tab name:', tab.name)
    if (!name?.trim() || name === tab.name) return
    try {
      await api.tabs.rename(tab.id, name.trim())
      setTabs((t) => t.map((x) => (x.id === tab.id ? { ...x, name: name.trim() } : x)))
      if (activeTab?.id === tab.id) setActiveTab({ ...tab, name: name.trim() })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const deleteTab = async (tab: Tab) => {
    if (tabs.length <= 1) return
    if (!confirm(`Delete tab "${tab.name}"? Tasks will move to another tab.`)) return
    try {
      await api.tabs.delete(tab.id)
      setTabs((t) => t.filter((x) => x.id !== tab.id))
      if (activeTab?.id === tab.id) setActiveTab(tabs.find((t) => t.id !== tab.id) ?? tabs[0])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const reorderTabs = async (newTabs: Tab[]) => {
    const prev = [...tabs]
    setTabs(newTabs.map((t, i) => ({ ...t, order: i })))
    try {
      const ownedIds = newTabs.filter((t) => t.isOwner).map((t) => t.id)
      await api.tabs.reorder(ownedIds)
    } catch (e) {
      setTabs(prev)
      alert(e instanceof Error ? e.message : 'Failed to save tab order')
    }
  }

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tabs.findIndex((t) => t.id === active.id)
    const newIndex = tabs.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(tabs, oldIndex, newIndex)
    reorderTabs(next)
  }

  return (
    <div className="dashboard">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-user">
          <span className="user-name">{user.username}</span>
          <button
            className={`btn-deadlines ${deadlineUrgency === 'soon' ? 'urgent' : ''} ${deadlineUrgency === 'critical' ? 'critical' : ''}`}
            onClick={() => { setShowDeadlines(true); setShowDailyTasks(false); setShowHistory(false); setShowSettings(false); setMobileMenu(false) }}
          >
            Deadlines
            {deadlineUrgency === 'critical' && <span className="deadlines-alert"> ‼️</span>}
          </button>
        </div>
        <div className="sidebar-tabs">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleTabDragEnd}
          >
            <div className="tabs">
              <SortableContext items={tabs.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {tabs.map((tab) => (
                  <SortableTab
                    key={tab.id}
                    tab={tab}
                    isActive={activeTab?.id === tab.id}
                    onSelect={() => {
                      setActiveTab(tab)
                      setShowDeadlines(false)
                      setShowDailyTasks(false)
                      setShowHistory(false)
                      setShowSettings(false)
                      setMobileMenu(false)
                    }}
                    onRename={() => { if (tab.accessRole !== 'view') renameTab(tab) }}
                    onDelete={(e) => { e.stopPropagation(); deleteTab(tab) }}
                    canDelete={tab.isOwner && tabs.filter((t) => t.isOwner).length > 1}
                    canDrag={tab.isOwner}
                  />
                ))}
              </SortableContext>
              <button className="tab-add" onClick={addTab}>+ New tab</button>
            </div>
          </DndContext>
        </div>
        {activeTab?.isOwner ? (
          <button className="btn-settings" onClick={() => openShareModal(activeTab)} disabled={accessBusy}>
            Share tab
          </button>
        ) : activeTab ? (
          <button className="btn-history" onClick={() => leaveSharedTab(activeTab)}>
            Leave shared tab
          </button>
        ) : null}
        <button className="btn-history" onClick={() => { setShowHistory(true); setShowSettings(false); setShowDeadlines(false); setShowDailyTasks(false); setMobileMenu(false) }}>
          History
        </button>
        <button className="btn-settings" onClick={() => { setShowSettings(true); setShowHistory(false); setShowDeadlines(false); setShowDailyTasks(false); setMobileMenu(false) }}>
          Settings
        </button>
        <button className="btn-logout" onClick={onLogout}>Log out</button>
      </aside>

      <main className="main">
        <header className="header">
          <button className="btn-mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <h1 className="header-title">PrivateTodo</h1>
          <button className="btn-history-mobile" onClick={() => setShowHistory(true)}>History</button>
          <button className="btn-logout-mobile" onClick={onLogout}>Log out</button>
        </header>

        {showHistory ? (
          <History onBack={() => setShowHistory(false)} onRestore={handleDataRefresh} />
        ) : showSettings ? (
          <Settings
            user={user}
            onBack={() => setShowSettings(false)}
            onUpdate={onUserUpdate}
            onAccountDeleted={onLogout}
            accentPresets={ACCENT_PRESETS}
          />
        ) : showDeadlines ? (
          <Deadlines tabs={tabs} onBack={() => setShowDeadlines(false)} onRefresh={handleDataRefresh} />
        ) : showDailyTasks ? (
          <DailyTasks onBack={() => setShowDailyTasks(false)} />
        ) : (
          <>
            {activeTab && (
              <TaskList
                tab={activeTab}
                tabs={tabs}
                onTabsChange={loadTabs}
                onTasksChange={refreshDeadlineUrgency}
              />
            )}
          </>
        )}
      </main>

      {shareOpen && activeTab?.isOwner && (
        <div className="share-modal-backdrop" onClick={() => setShareOpen(false)}>
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="share-header">
              <h2>Share "{activeTab.name}"</h2>
              <button className="share-close" onClick={() => setShareOpen(false)} aria-label="Close sharing">
                ×
              </button>
            </div>
            <p className="share-owner">Owner: {activeTab.ownerEmail}</p>
            <div className="share-invite-row">
              <input
                type="email"
                placeholder="Invite by email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                disabled={accessBusy}
              />
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value === 'edit' ? 'edit' : 'view')}
                disabled={accessBusy}
              >
                <option value="view">view</option>
                <option value="edit">edit</option>
              </select>
              <button onClick={inviteToTab} disabled={accessBusy || !shareEmail.trim()}>
                Invite
              </button>
            </div>
            {shareError ? <p className="share-error">{shareError}</p> : null}
            {shareMessage ? <p className="share-message">{shareMessage}</p> : null}
            <div className="share-section">
              <h3>Members</h3>
              <ul className="share-list">
                {shareMembers.map((member) => (
                  <li key={member.id} className="share-item">
                    <span>{member.email}</span>
                    {member.role === 'owner' ? (
                      <span className="share-owner-badge">owner</span>
                    ) : (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => changeAccessRole(member, e.target.value === 'edit' ? 'edit' : 'view')}
                          disabled={accessBusy}
                        >
                          <option value="view">view</option>
                          <option value="edit">edit</option>
                        </select>
                        <button onClick={() => removeAccess(member)} disabled={accessBusy}>Remove</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="share-section">
              <h3>Pending invitations</h3>
              {shareInvites.length === 0 ? (
                <p className="share-empty">No pending invitations.</p>
              ) : (
                <ul className="share-list">
                  {shareInvites.map((invite) => (
                    <li key={invite.id} className="share-item">
                      <span>{invite.email}</span>
                      <select
                        value={invite.role}
                        onChange={(e) => changeAccessRole(invite, e.target.value === 'edit' ? 'edit' : 'view')}
                        disabled={accessBusy}
                      >
                        <option value="view">view</option>
                        <option value="edit">edit</option>
                      </select>
                      <button onClick={() => removeAccess(invite)} disabled={accessBusy}>Cancel</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {mobileMenu && <div className="overlay" onClick={() => setMobileMenu(false)} />}

      <style>{`
        .dashboard {
          display: flex;
          min-height: 100vh;
        }
        .sidebar {
          width: 220px;
          flex-shrink: 0;
          background: var(--bg-elevated);
          border-right: 1px solid var(--border);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          overflow: hidden;
        }
        .sidebar-user {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .user-name {
          font-weight: 500;
          color: var(--text-muted);
        }
        .btn-logout, .btn-history, .btn-deadlines, .btn-settings {
          padding: 0.5rem 0;
          color: var(--text-muted);
          text-align: left;
          font-size: 0.95rem;
        }
        .btn-logout:hover, .btn-history:hover, .btn-deadlines:hover, .btn-settings:hover {
          color: var(--accent);
        }
        .btn-deadlines.urgent,
        .btn-deadlines.critical {
          color:rgb(255, 191, 0);
        }
        .btn-deadlines.critical {
          color: var(--danger);
          font-weight: 700;
        }
        .deadlines-alert {
          display: inline-block;
          animation: deadlinesBlink 1s step-start infinite;
        }
        @keyframes deadlinesBlink {
          50% {
            opacity: 0;
          }
        }
        .sidebar-tabs {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 0.5rem 0;
        }
        .btn-history {
          margin-top: auto;
        }
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          margin-left: 220px;
        }
        .header {
          display: none;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border);
        }
        .btn-mobile-menu {
          padding: 0.5rem;
          color: var(--text);
        }
        .header-title {
          flex: 1;
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }
        .btn-history-mobile, .btn-logout-mobile {
          padding: 0.5rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .tabs {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          padding: 0;
        }
        .tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0 0.4rem 0.5rem;
          cursor: grab;
          border-left: 3px solid transparent;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tab:hover {
          color: var(--text);
        }
        .tab.active {
          color: var(--accent);
          border-left-color: var(--accent);
          font-weight: 500;
        }
        .tab-name {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .tab-badge {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 0.1rem 0.35rem;
        }
        .tab-delete {
          padding: 0.25rem;
          color: var(--text-muted);
          font-size: 1.25rem;
          line-height: 1;
        }
        .tab-delete:hover {
          color: var(--danger);
        }
        .tab.dragging {
          opacity: 0.5;
          cursor: grabbing;
        }
        .tab-add {
          padding: 0.5rem 0;
          color: var(--text-muted);
          white-space: nowrap;
          text-align: left;
          margin-top: 0.25rem;
        }
        .tab-add:hover {
          color: var(--accent);
        }
        .overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 10;
        }
        .share-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .share-modal {
          width: 100%;
          max-width: 640px;
          max-height: 85vh;
          overflow-y: auto;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1rem;
        }
        .share-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .share-header h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .share-close {
          color: var(--text-muted);
          font-size: 1.2rem;
          padding: 0.25rem 0.5rem;
        }
        .share-owner {
          color: var(--text-muted);
          margin: 0.35rem 0 1rem;
        }
        .share-invite-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .share-invite-row input,
        .share-invite-row select,
        .share-item select {
          padding: 0.5rem 0.6rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
        }
        .share-invite-row button,
        .share-item button {
          padding: 0.5rem 0.7rem;
          background: var(--accent);
          color: white;
          border-radius: var(--radius);
        }
        .share-item button {
          background: transparent;
          color: var(--danger);
          border: 1px solid var(--danger);
        }
        .share-section {
          margin-top: 1rem;
        }
        .share-section h3 {
          margin: 0 0 0.5rem;
          font-size: 0.95rem;
        }
        .share-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .share-item {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 0.5rem;
          align-items: center;
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: var(--radius);
        }
        .share-owner-badge {
          color: var(--text-muted);
          text-transform: uppercase;
          font-size: 0.75rem;
        }
        .share-error {
          color: var(--danger);
          margin: 0.5rem 0 0;
        }
        .share-message {
          color: var(--success);
          margin: 0.5rem 0 0;
        }
        .share-empty {
          color: var(--text-muted);
          margin: 0;
        }
        @media (max-width: 767px) {
          .main {
            margin-left: 0;
          }
          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            height: 100vh;
            z-index: 20;
            transform: translateX(-100%);
            transition: transform 0.2s;
            overflow-y: auto;
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .header {
            display: flex;
          }
          .overlay {
            display: block;
          }
          .share-invite-row {
            grid-template-columns: 1fr;
          }
          .share-item {
            grid-template-columns: 1fr;
          }
        }
        @media (min-width: 768px) {
          .sidebar { display: flex; }
        }
      `}</style>
    </div>
  )
}
