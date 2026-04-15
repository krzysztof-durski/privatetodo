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
import { api, type IncomingTabInvite, type Tab, type TabAccessEntry, type TabInviteEntry, type Task } from './api'
import type { User } from './App'
import TaskList from './TaskList'
import History from './History'
import Settings from './Settings'
import Deadlines from './Deadlines'
import { useAppDialogs } from './AppDialogs'

type Props = { user: User; onLogout: () => void; onUserUpdate: (user: User) => void }

function SortableTab({
  tab,
  isActive,
  onSelect,
  onRename,
  canDrag,
}: {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onRename: () => void
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
      {tab.isOwner && tab.isShared ? <span className="tab-shared-indicator" title="Shared tab">👥</span> : null}
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

function tutorialSeenStorageKey(userId: number) {
  return `privatetodo:tutorialSeen:${userId}`
}

const TUTORIAL_STEPS = [
  {
    selector: '[data-tutorial="tab-add"]',
    title: 'Create a new tab',
    description: 'Click here to create a new workspace tab for a project, topic, or area of life.',
  },
  {
    selector: '[data-tutorial="task-input"]',
    title: 'Add tasks quickly',
    description: 'Type a task and press Enter. This is your main capture field.',
  },
  {
    selector: '[data-tutorial="deadlines"]',
    title: 'Check deadlines',
    description: 'Open Deadlines to review upcoming due items and quickly update priority tasks.',
  },
  {
    selector: '[data-tutorial="share-tab"]',
    title: 'Share with others',
    description: 'Use Share tab to invite collaborators with view or edit access.',
  },
  {
    selector: '[data-tutorial="history"]',
    title: 'Use task history',
    description: 'Open History to restore completed/deleted tasks or clean up old items.',
  },
  {
    selector: '[data-tutorial="settings"]',
    title: 'Tune your setup',
    description: 'Open Settings to customize colors, replay tutorial, and manage account options.',
  },
] as const

export default function Dashboard({ user, onLogout, onUserUpdate }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDeadlines, setShowDeadlines] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [deadlineUrgency, setDeadlineUrgency] = useState<'none' | 'soon' | 'critical'>('none')
  const [accessBusy, setAccessBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMembers, setShareMembers] = useState<TabAccessEntry[]>([])
  const [shareInvites, setShareInvites] = useState<TabInviteEntry[]>([])
  const [shareEmail, setShareEmail] = useState('')
  const [shareSuggestions, setShareSuggestions] = useState<string[]>([])
  const [shareRole, setShareRole] = useState<'edit' | 'view'>('view')
  const [shareError, setShareError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const { showAlert, showConfirm, showPrompt } = useAppDialogs()
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)
  const [tutorialTarget, setTutorialTarget] = useState<DOMRect | null>(null)
  const [incomingInvites, setIncomingInvites] = useState<IncomingTabInvite[]>([])
  const [invitePopup, setInvitePopup] = useState<IncomingTabInvite | null>(null)
  const [inviteActionBusy, setInviteActionBusy] = useState(false)
  const [inviteFromLinkId, setInviteFromLinkId] = useState<string | null>(null)

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

  const loadIncomingInvites = useCallback(async () => {
    try {
      const data = await api.invites.list()
      setIncomingInvites((data.invites ?? []) as IncomingTabInvite[])
    } catch {
      // Ignore invite polling errors to avoid interrupting app usage.
    }
  }, [])

  const clearInviteQueryParam = useCallback(() => {
    const next = new URL(window.location.href)
    next.searchParams.delete('invite')
    window.history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}`)
  }, [])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('invite')
    if (id && /^[a-f0-9]{32}$/.test(id)) {
      setInviteFromLinkId(id)
    }
  }, [])

  useEffect(() => {
    loadIncomingInvites()
  }, [loadIncomingInvites])

  useEffect(() => {
    let stopped = false
    const poll = async () => {
      if (stopped) return
      await loadIncomingInvites()
      if (!stopped) {
        window.setTimeout(poll, 15000)
      }
    }
    const timeoutId = window.setTimeout(poll, 15000)
    return () => {
      stopped = true
      window.clearTimeout(timeoutId)
    }
  }, [loadIncomingInvites])

  useEffect(() => {
    if (showSettings) {
      loadIncomingInvites()
    }
  }, [showSettings, loadIncomingInvites])

  useEffect(() => {
    const seen = localStorage.getItem(tutorialSeenStorageKey(user.id))
    if (!seen) {
      setShowSettings(false)
      setShowHistory(false)
      setShowDeadlines(false)
      setTutorialStep(0)
      setTutorialOpen(true)
    }
  }, [user.id])

  useEffect(() => {
    if (!tutorialOpen) return
    const updateTarget = () => {
      const selector = TUTORIAL_STEPS[tutorialStep]?.selector
      if (!selector) {
        setTutorialTarget(null)
        return
      }
      const el = document.querySelector(selector) as HTMLElement | null
      if (!el) {
        setTutorialTarget(null)
        return
      }
      const rect = el.getBoundingClientRect()
      setTutorialTarget(rect)
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
    updateTarget()
    window.addEventListener('resize', updateTarget)
    window.addEventListener('scroll', updateTarget, true)
    return () => {
      window.removeEventListener('resize', updateTarget)
      window.removeEventListener('scroll', updateTarget, true)
    }
  }, [tutorialOpen, tutorialStep])

  useEffect(() => {
    if (inviteFromLinkId) return
    const seen = new Set<string>()
    if (!incomingInvites.length) return
    const key = `privatetodo:seenInvites:${user.id}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => {
            if (typeof id === 'string') seen.add(id)
          })
        }
      }
    } catch {
      // Ignore malformed local storage values.
    }
    const firstUnseen = incomingInvites.find((invite) => !seen.has(invite.id))
    if (!firstUnseen) return
    setInvitePopup(firstUnseen)
    const nextSeen = Array.from(new Set([...seen, ...incomingInvites.map((invite) => invite.id)]))
    localStorage.setItem(key, JSON.stringify(nextSeen))
  }, [incomingInvites, user.id, inviteFromLinkId])

  useEffect(() => {
    if (!inviteFromLinkId || !incomingInvites.length) return
    const invite = incomingInvites.find((item) => item.id === inviteFromLinkId)
    if (invite) {
      setInvitePopup(invite)
      return
    }
    setInviteFromLinkId(null)
    clearInviteQueryParam()
    void showAlert('This invitation is no longer available.')
  }, [incomingInvites, inviteFromLinkId, clearInviteQueryParam])

  const handleInviteResponse = async (action: 'accept' | 'decline') => {
    if (!invitePopup || inviteActionBusy) return
    setInviteActionBusy(true)
    try {
      if (action === 'accept') await api.invites.accept(invitePopup.id)
      else await api.invites.decline(invitePopup.id)
      setInvitePopup(null)
      setIncomingInvites((prev) => prev.filter((invite) => invite.id !== invitePopup.id))
      setInviteFromLinkId(null)
      clearInviteQueryParam()
      handleDataRefresh()
      await loadIncomingInvites()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to update invitation')
    } finally {
      setInviteActionBusy(false)
    }
  }

  const addTab = async () => {
    const name = await showPrompt('Tab name:', { title: 'Create tab', placeholder: 'Tab name', confirmText: 'Create' })
    if (!name?.trim()) return
    try {
      const { tab } = await api.tabs.create(name.trim())
      setTabs((t) => [...t, tab].sort((a, b) => a.order - b.order))
      setActiveTab(tab)
      setShowDeadlines(false)
      setShowHistory(false)
      setShowSettings(false)
      setMobileMenu(false)
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const loadShareData = useCallback(async (tabId: string) => {
    const data = await api.tabs.accessList(tabId)
    setShareMembers(data.members as TabAccessEntry[])
    setShareInvites(data.invites as TabInviteEntry[])
  }, [])

  const loadShareSuggestions = useCallback(async () => {
    try {
      const data = await api.tabs.shareSuggestions()
      setShareSuggestions((data.emails as string[]) ?? [])
    } catch {
      setShareSuggestions([])
    }
  }, [])

  const openShareModal = async (tab: Tab) => {
    if (!tab.isOwner || accessBusy) return
    setAccessBusy(true)
    setShareError('')
    setShareMessage('')
    try {
      await Promise.all([loadShareData(tab.id), loadShareSuggestions()])
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
      await Promise.all([loadShareData(activeTab.id), loadShareSuggestions()])
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
    if (!await showConfirm(`Leave shared tab "${tab.name}"?`, { title: 'Leave shared tab', confirmText: 'Leave' })) return
    try {
      await api.tabs.leave(tab.id)
      await loadTabs()
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to leave tab')
    }
  }

  const renameTab = async (tab: Tab) => {
    const name = await showPrompt('Tab name:', { title: 'Rename tab', defaultValue: tab.name, placeholder: 'Tab name', confirmText: 'Save' })
    if (!name?.trim() || name === tab.name) return
    try {
      await api.tabs.rename(tab.id, name.trim())
      setTabs((t) => t.map((x) => (x.id === tab.id ? { ...x, name: name.trim() } : x)))
      if (activeTab?.id === tab.id) setActiveTab({ ...tab, name: name.trim() })
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const deleteTab = async (tab: Tab) => {
    const ownedTabs = tabs.filter((t) => t.isOwner)
    if (!tab.isOwner || ownedTabs.length <= 1) return
    if (!await showConfirm(`Delete tab "${tab.name}"? Tasks will move to another tab.`, { title: 'Delete tab', confirmText: 'Delete' })) return
    try {
      await api.tabs.delete(tab.id)
      setTabs((t) => t.filter((x) => x.id !== tab.id))
      if (activeTab?.id === tab.id) setActiveTab(tabs.find((t) => t.id !== tab.id) ?? tabs[0])
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed')
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
      await showAlert(e instanceof Error ? e.message : 'Failed to save tab order')
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

  const sidebarDisplayName = (() => {
    const atIndex = user.username.indexOf('@')
    return atIndex > 0 ? user.username.slice(0, atIndex) : user.username
  })()

  const closeTutorial = () => {
    localStorage.setItem(tutorialSeenStorageKey(user.id), '1')
    setTutorialOpen(false)
  }

  const replayTutorial = () => {
    setShowSettings(false)
    setShowHistory(false)
    setShowDeadlines(false)
    setTutorialStep(0)
    setTutorialOpen(true)
  }

  const tutorialModalStyle = (() => {
    if (!tutorialTarget) {
      return { right: '1rem', bottom: '1rem', left: 'auto', top: 'auto' } as const
    }
    const modalWidth = Math.min(560, Math.max(320, window.innerWidth - 32))
    const preferredLeft = tutorialTarget.right + 16
    const fitsRight = preferredLeft + modalWidth <= window.innerWidth - 12
    const left = fitsRight
      ? preferredLeft
      : Math.max(12, Math.min(window.innerWidth - modalWidth - 12, tutorialTarget.left - modalWidth - 16))
    const top = Math.max(12, Math.min(window.innerHeight - 260, tutorialTarget.top))
    return { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' } as const
  })()

  return (
    <div className="dashboard">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-user">
          <span className="user-name">{sidebarDisplayName}</span>
          <button
            data-tutorial="deadlines"
            className={`btn-deadlines ${deadlineUrgency === 'soon' ? 'urgent' : ''} ${deadlineUrgency === 'critical' ? 'critical' : ''}`}
            onClick={() => { setShowDeadlines(true); setShowHistory(false); setShowSettings(false); setMobileMenu(false) }}
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
                      setShowHistory(false)
                      setShowSettings(false)
                      setMobileMenu(false)
                    }}
                    onRename={() => { if (tab.accessRole !== 'view') renameTab(tab) }}
                    canDrag={tab.isOwner}
                  />
                ))}
              </SortableContext>
              <button className="tab-add" data-tutorial="tab-add" onClick={addTab}>+ New tab</button>
            </div>
          </DndContext>
        </div>
        {activeTab?.isOwner ? (
          <button className="btn-settings" data-tutorial="share-tab" onClick={() => openShareModal(activeTab)} disabled={accessBusy}>
            Share tab
          </button>
        ) : activeTab ? (
          <button className="btn-history" onClick={() => leaveSharedTab(activeTab)}>
            Leave shared tab
          </button>
        ) : null}
        <button className="btn-history" data-tutorial="history" onClick={() => { setShowHistory(true); setShowSettings(false); setShowDeadlines(false); setMobileMenu(false) }}>
          History
        </button>
        <button className="btn-settings" data-tutorial="settings" onClick={() => { setShowSettings(true); setShowHistory(false); setShowDeadlines(false); setMobileMenu(false) }}>
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
            tabs={tabs}
            onBack={() => setShowSettings(false)}
            onUpdate={onUserUpdate}
            onReplayTutorial={replayTutorial}
            onDeleteTab={deleteTab}
            onAccountDeleted={onLogout}
            onInvitesChanged={handleDataRefresh}
            accentPresets={ACCENT_PRESETS}
          />
        ) : showDeadlines ? (
          <Deadlines tabs={tabs} onBack={() => setShowDeadlines(false)} onRefresh={handleDataRefresh} />
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
                list="share-email-suggestions"
              />
              <datalist id="share-email-suggestions">
                {shareSuggestions.map((email) => (
                  <option key={email} value={email} />
                ))}
              </datalist>
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

      {invitePopup && (
        <div className="invite-popup-backdrop" onClick={() => !inviteActionBusy && setInvitePopup(null)}>
          <div className="invite-popup" onClick={(e) => e.stopPropagation()}>
            <button
              className="invite-popup-close"
              onClick={() => setInvitePopup(null)}
              aria-label="Close invitation popup"
              disabled={inviteActionBusy}
            >
              ×
            </button>
            <h3>New tab invitation</h3>
            <p>
              <strong>{invitePopup.ownerEmail}</strong> invited you to <strong>{invitePopup.tabName}</strong> ({invitePopup.role} access).
            </p>
            <div className="invite-popup-actions">
              <button
                onClick={() => handleInviteResponse('accept')}
                disabled={inviteActionBusy}
              >
                {inviteActionBusy ? 'Working...' : 'Confirm'}
              </button>
              <button className="invite-popup-dismiss" onClick={() => handleInviteResponse('decline')} disabled={inviteActionBusy}>
                {inviteActionBusy ? 'Working...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tutorialOpen && (
        <div className="tutorial-backdrop">
          <div className="tutorial-modal" style={tutorialModalStyle} onClick={(e) => e.stopPropagation()}>
            <button className="tutorial-close" onClick={closeTutorial} aria-label="Close tutorial">
              ×
            </button>
            <h3>Welcome to Codepapa TODO</h3>
            <p className="tutorial-subtitle">Interactive guide: follow the highlight and try each action live.</p>
            <div className="tutorial-card">
              <strong>{TUTORIAL_STEPS[tutorialStep]?.title}</strong>
              <p>{TUTORIAL_STEPS[tutorialStep]?.description}</p>
            </div>
            <div className="tutorial-progress">
              {tutorialStep + 1} / {TUTORIAL_STEPS.length}
            </div>
            <div className="tutorial-actions">
              <button onClick={closeTutorial} className="tutorial-skip">
                Skip
              </button>
              <button
                onClick={() => setTutorialStep((step) => Math.max(0, step - 1))}
                disabled={tutorialStep === 0}
                className="tutorial-back-btn"
              >
                Back
              </button>
              {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
                <button
                  onClick={() => setTutorialStep((step) => Math.min(TUTORIAL_STEPS.length - 1, step + 1))}
                  className="tutorial-next-btn"
                >
                  Next
                </button>
              ) : (
                <button onClick={closeTutorial} className="tutorial-next-btn">
                  Finish
                </button>
              )}
            </div>
          </div>
          {tutorialTarget && (
            <>
              <div
                className="tutorial-dim tutorial-dim-top"
                style={{ left: 0, top: 0, width: '100vw', height: Math.max(0, tutorialTarget.top - 8) }}
              />
              <div
                className="tutorial-dim tutorial-dim-left"
                style={{
                  left: 0,
                  top: Math.max(0, tutorialTarget.top - 8),
                  width: Math.max(0, tutorialTarget.left - 8),
                  height: tutorialTarget.height + 16,
                }}
              />
              <div
                className="tutorial-dim tutorial-dim-right"
                style={{
                  left: tutorialTarget.right + 8,
                  top: Math.max(0, tutorialTarget.top - 8),
                  width: Math.max(0, window.innerWidth - tutorialTarget.right - 8),
                  height: tutorialTarget.height + 16,
                }}
              />
              <div
                className="tutorial-dim tutorial-dim-bottom"
                style={{
                  left: 0,
                  top: tutorialTarget.bottom + 8,
                  width: '100vw',
                  height: Math.max(0, window.innerHeight - tutorialTarget.bottom - 8),
                }}
              />
              <div
                className="tutorial-spotlight"
                style={{
                  left: tutorialTarget.left - 8,
                  top: tutorialTarget.top - 8,
                  width: tutorialTarget.width + 16,
                  height: tutorialTarget.height + 16,
                }}
              />
              <div
                className="tutorial-pointer"
                style={{
                  left: tutorialTarget.left + tutorialTarget.width / 2 - 14,
                  top: tutorialTarget.top - 28,
                }}
              >
                ↓
              </div>
            </>
          )}
        </div>
      )}

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
          gap: 0.65rem;
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
          padding: 0.4rem 0;
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
          margin-top: 0.35rem;
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
        .tab-shared-indicator {
          flex-shrink: 0;
          opacity: 0.85;
          font-size: 0.95rem;
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
        .invite-popup-backdrop {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          padding: 1rem;
          pointer-events: none;
          z-index: 40;
        }
        .invite-popup {
          width: min(360px, 100%);
          border: 1px solid var(--border);
          background: var(--bg-elevated);
          border-radius: var(--radius);
          padding: 0.9rem;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
          pointer-events: auto;
          position: relative;
        }
        .invite-popup-close {
          position: absolute;
          top: 0.4rem;
          right: 0.4rem;
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 999px;
          font-size: 1.1rem;
          line-height: 1;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .invite-popup-close:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text);
        }
        .invite-popup-close:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .invite-popup h3 {
          margin: 0 0 0.4rem;
          font-size: 1rem;
          padding-right: 2rem;
        }
        .invite-popup p {
          margin: 0;
          color: var(--text-muted);
          line-height: 1.4;
        }
        .invite-popup-actions {
          margin-top: 0.75rem;
          display: flex;
          gap: 0.5rem;
        }
        .invite-popup-actions button {
          padding: 0.45rem 0.7rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: white;
        }
        .invite-popup-actions .invite-popup-dismiss {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
        }
        .tutorial-backdrop {
          position: fixed;
          inset: 0;
          background: transparent;
          z-index: 60;
          padding: 0;
          pointer-events: none;
        }
        .tutorial-modal {
          width: min(560px, calc(100% - 2rem));
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1rem;
          position: relative;
          margin: 1rem;
          position: fixed;
          right: 1rem;
          bottom: 1rem;
          pointer-events: auto;
          z-index: 64;
          transition: left 180ms ease, top 180ms ease;
        }
        .tutorial-close {
          position: absolute;
          top: 0.45rem;
          right: 0.5rem;
          color: var(--text-muted);
          font-size: 1.2rem;
          line-height: 1;
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .tutorial-close:hover {
          color: var(--text);
          background: rgba(255, 255, 255, 0.08);
        }
        .tutorial-modal h3 {
          margin: 0;
          font-size: 1.2rem;
        }
        .tutorial-subtitle {
          margin: 0.35rem 0 0.9rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .tutorial-card {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg);
          padding: 0.85rem;
          min-height: 110px;
        }
        .tutorial-card strong {
          display: block;
          margin: 0 0 0.4rem;
          font-size: 1rem;
        }
        .tutorial-card p {
          margin: 0;
          color: var(--text-muted);
          line-height: 1.45;
        }
        .tutorial-progress {
          margin-top: 0.7rem;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        .tutorial-actions {
          margin-top: 0.95rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        .tutorial-actions button {
          border-radius: var(--radius);
          padding: 0.45rem 0.8rem;
        }
        .tutorial-skip,
        .tutorial-back-btn {
          border: 1px solid var(--border);
          color: var(--text-muted);
          background: transparent;
        }
        .tutorial-next-btn {
          background: var(--accent);
          color: #fff;
        }
        .tutorial-dim {
          position: fixed;
          background: rgba(0, 0, 0, 0.28);
          pointer-events: none;
          z-index: 61;
        }
        .tutorial-spotlight {
          position: fixed;
          border-radius: 12px;
          border: 2px solid var(--accent);
          background: transparent;
          pointer-events: none;
          animation: tutorialPulse 1.15s ease-in-out infinite;
          z-index: 62;
        }
        .tutorial-pointer {
          position: fixed;
          color: var(--accent);
          font-size: 1.3rem;
          font-weight: 700;
          pointer-events: none;
          z-index: 63;
          animation: tutorialBounce 1s ease-in-out infinite;
          text-shadow: 0 0 10px rgba(0, 0, 0, 0.7);
        }
        @keyframes tutorialPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.85; }
        }
        @keyframes tutorialBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(5px); }
        }
        @media (max-width: 767px) {
          .tutorial-modal {
            left: 1rem;
            right: 1rem;
            bottom: 1rem;
            width: auto;
          }
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
          .invite-popup-backdrop {
            justify-content: center;
            align-items: flex-end;
          }
          .invite-popup {
            width: 100%;
          }
        }
        @media (min-width: 768px) {
          .sidebar { display: flex; }
        }
      `}</style>
    </div>
  )
}
