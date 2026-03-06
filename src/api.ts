const API = '/todo/api'

async function fetchApi(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      fetchApi('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (username: string, password: string) =>
      fetchApi('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchApi('/auth/logout', { method: 'POST' }),
    me: () => fetchApi('/auth/me'),
    updateSettings: (accent_color: string) =>
      fetchApi('/auth/settings', { method: 'PUT', body: JSON.stringify({ accent_color }) }),
  },
  tabs: {
    list: () => fetchApi('/tabs'),
    create: (name: string) => fetchApi('/tabs', { method: 'POST', body: JSON.stringify({ name }) }),
    rename: (id: string, name: string) => fetchApi(`/tabs/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    delete: (id: string) => fetchApi(`/tabs/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (tabId: string) => fetchApi(`/tasks?tabId=${tabId}`),
    create: (tabId: string, text: string) =>
      fetchApi('/tasks', { method: 'POST', body: JSON.stringify({ tabId, text }) }),
    update: (id: string, data: { text?: string; completed?: boolean; note?: string; order?: number }) =>
      fetchApi(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/tasks/${id}`, { method: 'DELETE' }),
    reorder: (tabId: string, taskIds: string[]) =>
      fetchApi('/tasks/reorder', { method: 'PUT', body: JSON.stringify({ tabId, taskIds }) }),
  },
  history: {
    completed: () => fetchApi('/history/completed'),
    deleted: () => fetchApi('/history/deleted'),
    restoreCompleted: (id: string, tabId?: string) =>
      fetchApi(`/history/completed/${id}`, { method: 'POST', body: JSON.stringify({ tabId }) }),
    moveCompletedToDeleted: (id: string) =>
      fetchApi(`/history/completed/${id}/to-deleted`, { method: 'POST' }),
    restoreDeleted: (id: string, tabId?: string) =>
      fetchApi(`/history/deleted/${id}`, { method: 'POST', body: JSON.stringify({ tabId }) }),
    permanentlyDelete: (id: string) =>
      fetchApi(`/history/deleted/${id}`, { method: 'DELETE' }),
    permanentlyDeleteAll: () =>
      fetchApi('/history/deleted', { method: 'DELETE' }),
  },
}

export type Tab = { id: string; name: string; order: number }
export type Task = { id: string; text: string; completed: number; completed_at: string | null; order: number; note: string | null }
export type HistoryTask = { id: string; text: string; note: string | null; tab_name: string; completed_at?: string; deleted_at?: string; created_at?: string }
