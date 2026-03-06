import type { D1Database } from '@cloudflare/workers-types'

export interface ApiEnv {
  DB: D1Database
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltB64 = btoa(String.fromCharCode(...salt))
  return `${saltB64}:${hash}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hash] = stored.split(':')
  const salt = new Uint8Array(atob(saltB64).split('').map((c) => c.charCodeAt(0)))
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
  const computed = btoa(String.fromCharCode(...new Uint8Array(bits)))
  return computed === hash
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

function getSessionId(request: Request): string | null {
  const cookie = request.headers.get('Cookie')
  if (!cookie) return null
  const match = cookie.match(/session=([^;]+)/)
  return match ? match[1] : null
}

async function requireAuth(request: Request, env: ApiEnv): Promise<{ userId: number; username: string } | null> {
  const sessionId = getSessionId(request)
  if (!sessionId) return null
  const row = await env.DB.prepare(
    'SELECT s.user_id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime("now")'
  )
    .bind(sessionId)
    .first()
  if (!row) return null
  return { userId: row.user_id as number, username: row.username as string }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setSessionCookie(response: Response, sessionId: string) {
  const headers = new Headers(response.headers)
  headers.append(
    'Set-Cookie',
    `session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`
  )
  return new Response(response.body, { status: response.status, headers })
}

export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api/, '') || '/'

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const addCors = (r: Response) => {
    const h = new Headers(r.headers)
    Object.entries(corsHeaders).forEach(([k, v]) => h.set(k, v))
    return new Response(r.body, { status: r.status, headers: h })
  }

  try {
    if (path === '/auth/register' && request.method === 'POST') {
      const body = (await request.json()) as { username: string; password: string }
      const { username, password } = body
      if (!username?.trim() || !password) {
        return addCors(jsonResponse({ error: 'Username and password required' }, 400))
      }
      const hash = await hashPassword(password)
      try {
        await env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
          .bind(username.trim().toLowerCase(), hash)
          .run()
      } catch (e: unknown) {
        if (String(e).includes('UNIQUE')) {
          return addCors(jsonResponse({ error: 'Username already exists' }, 409))
        }
        throw e
      }
      const user = (await env.DB.prepare('SELECT id, username, accent_color FROM users WHERE username = ?')
        .bind(username.trim().toLowerCase())
        .first()) as { id: number; username: string; accent_color: string | null }
      const sessionId = randomId()
      await env.DB.prepare(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+30 days"))'
      )
        .bind(sessionId, user.id)
        .run()
      const accent = user.accent_color ?? '#7c5cff'
      const res = jsonResponse({ user: { id: user.id, username: user.username, accent_color: accent } })
      return addCors(setSessionCookie(res, sessionId))
    }

    if (path === '/auth/login' && request.method === 'POST') {
      const body = (await request.json()) as { username: string; password: string }
      const { username, password } = body
      if (!username?.trim() || !password) {
        return addCors(jsonResponse({ error: 'Username and password required' }, 400))
      }
      const user = (await env.DB.prepare('SELECT id, username, password_hash, accent_color FROM users WHERE username = ?')
        .bind(username.trim().toLowerCase())
        .first()) as { id: number; username: string; password_hash: string; accent_color: string | null }
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return addCors(jsonResponse({ error: 'Invalid username or password' }, 401))
      }
      const sessionId = randomId()
      await env.DB.prepare(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+30 days"))'
      )
        .bind(sessionId, user.id)
        .run()
      const accent = user.accent_color ?? '#7c5cff'
      const res = jsonResponse({ user: { id: user.id, username: user.username, accent_color: accent } })
      return addCors(setSessionCookie(res, sessionId))
    }

    if (path === '/auth/logout' && request.method === 'POST') {
      const sessionId = getSessionId(request)
      if (sessionId) {
        await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
      }
      const res = jsonResponse({ ok: true })
      const headers = new Headers(res.headers)
      headers.append('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0')
      return addCors(new Response(res.body, { status: res.status, headers }))
    }

    if (path === '/auth/me' && request.method === 'GET') {
      const auth = await requireAuth(request, env)
      if (!auth) return addCors(jsonResponse({ error: 'Unauthorized' }, 401))
      const user = (await env.DB.prepare('SELECT id, username, accent_color FROM users WHERE id = ?')
        .bind(auth.userId)
        .first()) as { id: number; username: string; accent_color: string | null } | null
      const accent = user?.accent_color ?? '#7c5cff'
      return addCors(jsonResponse({ user: { id: auth.userId, username: auth.username, accent_color: accent } }))
    }

    if (path === '/auth/settings' && request.method === 'PUT') {
      const auth = await requireAuth(request, env)
      if (!auth) return addCors(jsonResponse({ error: 'Unauthorized' }, 401))
      const body = (await request.json()) as { accent_color?: string }
      const hex = /^#[0-9A-Fa-f]{6}$/.test(body.accent_color ?? '') ? body.accent_color : '#7c5cff'
      await env.DB.prepare('UPDATE users SET accent_color = ? WHERE id = ?')
        .bind(hex, auth.userId)
        .run()
      return addCors(jsonResponse({ user: { id: auth.userId, username: auth.username, accent_color: hex } }))
    }

    const auth = await requireAuth(request, env)
    if (!auth) return addCors(jsonResponse({ error: 'Unauthorized' }, 401))

    const { userId } = auth

    if (path === '/tabs' && request.method === 'GET') {
      let rows = await env.DB.prepare(
        'SELECT id, name, "order" FROM tabs WHERE user_id = ? ORDER BY "order"'
      )
        .bind(userId)
        .all()
      if (rows.results.length === 0) {
        const id = randomId()
        await env.DB.prepare('INSERT INTO tabs (id, user_id, name, "order") VALUES (?, ?, ?, 0)')
          .bind(id, userId, 'My Tasks')
          .run()
        rows = { results: [{ id, name: 'My Tasks', order: 0 }] }
      }
      return addCors(jsonResponse({ tabs: rows.results }))
    }

    if (path === '/tabs' && request.method === 'POST') {
      const body = (await request.json()) as { name: string }
      const name = body.name?.trim()
      if (!name) return addCors(jsonResponse({ error: 'Tab name required' }, 400))
      const count = (await env.DB.prepare('SELECT COUNT(*) as c FROM tabs WHERE user_id = ?').bind(userId).first()) as { c: number }
      const order = (count?.c ?? 0)
      const id = randomId()
      await env.DB.prepare('INSERT INTO tabs (id, user_id, name, "order") VALUES (?, ?, ?, ?)')
        .bind(id, userId, name, order)
        .run()
      return addCors(jsonResponse({ tab: { id, name, order } }))
    }

    if (path.startsWith('/tabs/') && request.method === 'PUT') {
      const tabId = path.slice(6)
      const body = (await request.json()) as { name?: string }
      const name = body.name?.trim()
      if (!name) return addCors(jsonResponse({ error: 'Tab name required' }, 400))
      await env.DB.prepare('UPDATE tabs SET name = ? WHERE id = ? AND user_id = ?')
        .bind(name, tabId, userId)
        .run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tabs/') && request.method === 'DELETE') {
      const tabId = path.slice(6)
      const tabs = (await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order"').bind(userId).all()).results as { id: string }[]
      if (tabs.length <= 1) return addCors(jsonResponse({ error: 'Cannot delete last tab' }, 400))
      const targetTabId = tabs.find((t) => t.id !== tabId)?.id ?? tabs[0].id
      await env.DB.prepare('UPDATE tasks SET tab_id = ? WHERE tab_id = ? AND user_id = ?')
        .bind(targetTabId, tabId, userId)
        .run()
      await env.DB.prepare('DELETE FROM tabs WHERE id = ? AND user_id = ?').bind(tabId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path === '/tasks' && request.method === 'GET') {
      const tabId = url.searchParams.get('tabId')
      if (!tabId) return addCors(jsonResponse({ error: 'tabId required' }, 400))
      const rows = await env.DB.prepare(
        'SELECT id, text, completed, completed_at, "order", note FROM tasks WHERE user_id = ? AND tab_id = ? ORDER BY "order"'
      )
        .bind(userId, tabId)
        .all()
      return addCors(jsonResponse({ tasks: rows.results }))
    }

    if (path === '/tasks' && request.method === 'POST') {
      const body = (await request.json()) as { tabId: string; text: string }
      const { tabId, text } = body
      if (!tabId || !text?.trim()) return addCors(jsonResponse({ error: 'tabId and text required' }, 400))
      const maxOrderRow = (await env.DB.prepare('SELECT COALESCE(MAX("order"), -1) + 1 as o FROM tasks WHERE user_id = ? AND tab_id = ?')
        .bind(userId, tabId)
        .first()) as { o: number } | null
      const order = maxOrderRow?.o ?? 0
      const id = randomId()
      await env.DB.prepare(
        'INSERT INTO tasks (id, user_id, tab_id, text, "order") VALUES (?, ?, ?, ?, ?)'
      )
        .bind(id, userId, tabId, text.trim(), order)
        .run()
      return addCors(jsonResponse({ task: { id, text: text.trim(), completed: 0, completed_at: null, order, note: null } }))
    }

    if (path === '/tasks/reorder' && request.method === 'PUT') {
      const body = (await request.json()) as { tabId: string; taskIds: string[] }
      const { tabId, taskIds } = body
      if (!tabId || !taskIds?.length) return addCors(jsonResponse({ error: 'tabId and taskIds required' }, 400))
      for (let i = 0; i < taskIds.length; i++) {
        await env.DB.prepare('UPDATE tasks SET "order" = ? WHERE id = ? AND user_id = ? AND tab_id = ?')
          .bind(i, taskIds[i], userId, tabId)
          .run()
      }
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tasks/') && request.method === 'PUT') {
      const taskId = path.slice(7)
      const body = (await request.json()) as { text?: string; completed?: boolean; note?: string; order?: number }
      const task = (await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { id: string } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      if (body.text !== undefined) {
        await env.DB.prepare('UPDATE tasks SET text = ? WHERE id = ? AND user_id = ?').bind(body.text.trim(), taskId, userId).run()
      }
      if (body.completed !== undefined) {
        const completedAt = body.completed ? new Date().toISOString() : null
        await env.DB.prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ? AND user_id = ?')
          .bind(body.completed ? 1 : 0, completedAt, taskId, userId)
          .run()
        if (body.completed) {
          const t = (await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string; created_at: string }
          const tab = (await env.DB.prepare('SELECT name FROM tabs WHERE id = ?').bind(t.tab_id).first()) as { name: string } | null
          await env.DB.prepare(
            'INSERT INTO completed_tasks (id, user_id, tab_id, tab_name, text, note, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
            .bind(taskId, userId, t.tab_id, tab?.name ?? '', t.text, t.note, completedAt, t.created_at)
            .run()
          await env.DB.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
        }
      }
      if (body.note !== undefined) {
        await env.DB.prepare('UPDATE tasks SET note = ? WHERE id = ? AND user_id = ?').bind(body.note || null, taskId, userId).run()
      }
      if (body.order !== undefined) {
        await env.DB.prepare('UPDATE tasks SET "order" = ? WHERE id = ? AND user_id = ?').bind(body.order, taskId, userId).run()
      }
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tasks/') && request.method === 'DELETE') {
      const taskId = path.slice(7)
      const task = (await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string; created_at: string } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      const tab = (await env.DB.prepare('SELECT name FROM tabs WHERE id = ?').bind(task.tab_id).first()) as { name: string } | null
      await env.DB.prepare(
        'INSERT INTO deleted_tasks (id, user_id, tab_id, tab_name, text, note, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(taskId, userId, task.tab_id, tab?.name ?? '', task.text, task.note, new Date().toISOString(), task.created_at)
        .run()
      await env.DB.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path === '/history/completed' && request.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT id, text, note, tab_name, completed_at, created_at FROM completed_tasks WHERE user_id = ? ORDER BY completed_at DESC'
      )
        .bind(userId)
        .all()
      return addCors(jsonResponse({ tasks: rows.results }))
    }

    if (path.endsWith('/to-deleted') && path.startsWith('/history/completed/') && request.method === 'POST') {
      const taskId = path.slice(19, path.length - 11)
      const task = (await env.DB.prepare('SELECT * FROM completed_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string | null; tab_name: string } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      await env.DB.prepare(
        'INSERT INTO deleted_tasks (id, user_id, tab_id, tab_name, text, note, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(taskId, userId, task.tab_id ?? '', task.tab_name ?? '', task.text, task.note, new Date().toISOString(), task.created_at)
        .run()
      await env.DB.prepare('DELETE FROM completed_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/history/completed/') && request.method === 'POST') {
      const taskId = path.slice(19)
      const body = (await request.json()) as { tabId?: string }
      const task = (await env.DB.prepare('SELECT * FROM completed_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string | null; tab_name: string } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      let tabId = body.tabId ?? task.tab_id
      if (!tabId) {
        const firstTab = (await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string } | null
        tabId = firstTab?.id ?? ''
      }
      const tabExists = (await env.DB.prepare('SELECT id FROM tabs WHERE id = ? AND user_id = ?').bind(tabId, userId).first()) as { id: string } | null
      const targetTabId = tabExists ? tabId : ((await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string })?.id
      if (!targetTabId) return addCors(jsonResponse({ error: 'No tab available' }, 400))
      const maxOrderRow = (await env.DB.prepare('SELECT COALESCE(MAX("order"), -1) + 1 as o FROM tasks WHERE user_id = ? AND tab_id = ?')
        .bind(userId, targetTabId)
        .first()) as { o: number } | null
      const order = maxOrderRow?.o ?? 0
      await env.DB.prepare(
        'INSERT INTO tasks (id, user_id, tab_id, text, completed, "order", note) VALUES (?, ?, ?, ?, 0, ?, ?)'
      )
        .bind(taskId, userId, targetTabId, task.text, order, task.note)
        .run()
      await env.DB.prepare('DELETE FROM completed_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true, tabId: targetTabId }))
    }

    if (path === '/history/deleted' && request.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT id, text, note, tab_name, deleted_at, created_at FROM deleted_tasks WHERE user_id = ? ORDER BY deleted_at DESC'
      )
        .bind(userId)
        .all()
      return addCors(jsonResponse({ tasks: rows.results }))
    }

    if (path === '/history/deleted' && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM deleted_tasks WHERE user_id = ?').bind(userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/history/deleted/') && request.method === 'DELETE') {
      const taskId = path.slice(17)
      const task = (await env.DB.prepare('SELECT id FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { id: string } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      await env.DB.prepare('DELETE FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/history/deleted/') && request.method === 'POST') {
      const taskId = path.slice(17)
      const body = (await request.json()) as { tabId?: string }
      const task = (await env.DB.prepare('SELECT * FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string | null } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      let tabId = body.tabId ?? task.tab_id
      if (!tabId) {
        const firstTab = (await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string } | null
        tabId = firstTab?.id ?? ''
      }
      const tabExists = (await env.DB.prepare('SELECT id FROM tabs WHERE id = ? AND user_id = ?').bind(tabId, userId).first()) as { id: string } | null
      const targetTabId = tabExists ? tabId : ((await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string })?.id
      if (!targetTabId) return addCors(jsonResponse({ error: 'No tab available' }, 400))
      const maxOrderRow = (await env.DB.prepare('SELECT COALESCE(MAX("order"), -1) + 1 as o FROM tasks WHERE user_id = ? AND tab_id = ?')
        .bind(userId, targetTabId)
        .first()) as { o: number } | null
      const order = maxOrderRow?.o ?? 0
      await env.DB.prepare(
        'INSERT INTO tasks (id, user_id, tab_id, text, completed, "order", note) VALUES (?, ?, ?, ?, 0, ?, ?)'
      )
        .bind(taskId, userId, targetTabId, task.text, order, task.note)
        .run()
      await env.DB.prepare('DELETE FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true, tabId: targetTabId }))
    }

    return addCors(jsonResponse({ error: 'Not found' }, 404))
  } catch (err) {
    console.error(err)
    return addCors(jsonResponse({ error: 'Internal server error' }, 500))
  }
}
