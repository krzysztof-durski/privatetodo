import { useEffect, useState } from 'react'
import { api, type Tab } from './api'
import TaskList from './TaskList'
import History from './History'

type Props = { user: { id: number; username: string }; onLogout: () => void }

export default function Dashboard({ user, onLogout }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)

  const loadTabs = () => api.tabs.list().then((d) => { setTabs(d.tabs); if (!activeTab && d.tabs[0]) setActiveTab(d.tabs[0]) })

  useEffect(() => {
    loadTabs()
  }, [])

  useEffect(() => {
    if (tabs.length && !activeTab) setActiveTab(tabs[0])
    if (tabs.length && activeTab && !tabs.find((t) => t.id === activeTab.id)) setActiveTab(tabs[0])
  }, [tabs, activeTab])

  const addTab = async () => {
    const name = prompt('Tab name:')
    if (!name?.trim()) return
    try {
      const { tab } = await api.tabs.create(name.trim())
      setTabs((t) => [...t, tab].sort((a, b) => a.order - b.order))
      setActiveTab(tab)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
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

  return (
    <div className="dashboard">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-user">
          <span className="user-name">{user.username}</span>
          <button className="btn-logout" onClick={onLogout}>Log out</button>
        </div>
        <button className="btn-history" onClick={() => { setShowHistory(true); setMobileMenu(false) }}>
          History
        </button>
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
          <History onBack={() => setShowHistory(false)} onRestore={loadTabs} />
        ) : (
          <>
            <div className="tabs-wrap">
              <div className="tabs">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`tab ${activeTab?.id === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                    onDoubleClick={() => renameTab(tab)}
                  >
                    <span className="tab-name">{tab.name}</span>
                    {tabs.length > 1 && (
                      <button
                        className="tab-delete"
                        onClick={(e) => { e.stopPropagation(); deleteTab(tab) }}
                        aria-label="Delete tab"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button className="tab-add" onClick={addTab}>+ New tab</button>
              </div>
            </div>

            {activeTab && (
              <TaskList
                tab={activeTab}
                onTabsChange={loadTabs}
              />
            )}
          </>
        )}
      </main>

      {mobileMenu && <div className="overlay" onClick={() => setMobileMenu(false)} />}

      <style>{`
        .dashboard {
          display: flex;
          min-height: 100vh;
        }
        .sidebar {
          width: 220px;
          background: var(--bg-elevated);
          border-right: 1px solid var(--border);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
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
        .btn-logout, .btn-history {
          padding: 0.5rem 0;
          color: var(--text-muted);
          text-align: left;
          font-size: 0.95rem;
        }
        .btn-logout:hover, .btn-history:hover {
          color: var(--accent);
        }
        .btn-history {
          margin-top: auto;
        }
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
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
        .tabs-wrap {
          overflow-x: auto;
          border-bottom: 1px solid var(--border);
        }
        .tabs {
          display: flex;
          gap: 0;
          padding: 0 1.5rem;
          min-width: min-content;
        }
        .tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 1.25rem;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .tab:hover {
          color: var(--text);
        }
        .tab.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
          font-weight: 500;
        }
        .tab-name {
          flex: 1;
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
        .tab-add {
          padding: 1rem 1.25rem;
          color: var(--text-muted);
          white-space: nowrap;
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
        @media (max-width: 767px) {
          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            height: 100vh;
            z-index: 20;
            transform: translateX(-100%);
            transition: transform 0.2s;
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
        }
        @media (min-width: 768px) {
          .sidebar { display: flex; }
        }
      `}</style>
    </div>
  )
}
