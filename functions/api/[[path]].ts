import type { D1Database } from '@cloudflare/workers-types'
import { Resend } from 'resend'

const ENC_PREFIX = 'ENCv1:'
const ID_REGEX = /^[a-f0-9]{32}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_REGEX = /^\d{6}$/
const DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export interface Env {
  DB: D1Database
  ENCRYPTION_KEY?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}

function randomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = env.RESEND_API_KEY
  const from = env.RESEND_FROM || 'Codepapa TODO <onboarding@resend.dev>'
  if (!apiKey) return { ok: false, error: 'Email not configured. Set RESEND_API_KEY in production.' }
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from, to, subject, html })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    console.error('Resend send failed:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to send email' }
  }
}

async function getEncryptionKey(env: Env): Promise<CryptoKey | null> {
  const raw = env.ENCRYPTION_KEY
  if (!raw || raw.length < 32) return null
  let keyBytes: Uint8Array
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    keyBytes = new Uint8Array(32)
    for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16)
  } else {
    keyBytes = new Uint8Array(atob(raw.replace(/-/g, '+').replace(/_/g, '/')).split('').map((c) => c.charCodeAt(0)))
  }
  if (keyBytes.length !== 32) return null
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encrypt(plaintext: string, env: Env): Promise<string> {
  if (!plaintext) return plaintext
  const key = await getEncryptionKey(env)
  if (!key) return plaintext
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded
  )
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return ENC_PREFIX + btoa(String.fromCharCode(...combined))
}

async function decrypt(ciphertext: string, env: Env): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext
  const key = await getEncryptionKey(env)
  if (!key) return ciphertext
  const raw = atob(ciphertext.slice(ENC_PREFIX.length))
  const combined = new Uint8Array(raw.split('').map((c) => c.charCodeAt(0)))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    data
  )
  return new TextDecoder().decode(decrypted)
}

/** Shift existing tasks so a new row can use order 0 (top of list). */
async function bumpTaskOrdersForTab(env: Env, userId: number, tabId: string) {
  await env.DB.prepare('UPDATE tasks SET "order" = "order" + 1 WHERE user_id = ? AND tab_id = ?')
    .bind(userId, tabId)
    .run()
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

function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim()
  if (cfIp) return cfIp
  const forwardedFor = request.headers.get('X-Forwarded-For')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

async function checkRateLimit(
  env: Env,
  request: Request | null,
  route: string,
  limit: number,
  windowSeconds: number,
  identifierOverride?: string
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % windowSeconds)
  const identifier = identifierOverride || (request ? getClientIp(request) : 'unknown')

  await env.DB.prepare(
    `INSERT INTO rate_limits (identifier, route, window_start, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(identifier, route, window_start)
     DO UPDATE SET count = count + 1, updated_at = datetime('now')`
  )
    .bind(identifier, route, windowStart)
    .run()

  const row = (await env.DB.prepare(
    'SELECT count FROM rate_limits WHERE identifier = ? AND route = ? AND window_start = ?'
  )
    .bind(identifier, route, windowStart)
    .first()) as { count: number } | null

  if ((row?.count ?? 0) > limit) {
    const retryAfter = Math.max(1, windowStart + windowSeconds - now)
    return { allowed: false, retryAfter }
  }

  const oldWindowCutoff = now - windowSeconds * 4
  await env.DB.prepare('DELETE FROM rate_limits WHERE route = ? AND window_start < ?')
    .bind(route, oldWindowCutoff)
    .run()

  return { allowed: true }
}

function normalizeEmail(email: string | undefined): string {
  return (email || '').trim().toLowerCase()
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function dayFromQuery(value: string | null, field = 'day'): string {
  if (!value) return todayUtc()
  if (!DAY_REGEX.test(value)) throw new ApiValidationError(`${field} must be YYYY-MM-DD`)
  return value
}

class ApiValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ApiValidationError'
    this.status = status
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let data: unknown
  try {
    data = await request.json()
  } catch {
    throw new ApiValidationError('Invalid JSON body')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiValidationError('JSON body must be an object')
  }
  return data as Record<string, unknown>
}

function requireString(value: unknown, field: string, min = 1, max = 1000): string {
  if (typeof value !== 'string') throw new ApiValidationError(`${field} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length < min) throw new ApiValidationError(`${field} is required`)
  if (trimmed.length > max) throw new ApiValidationError(`${field} is too long`)
  return trimmed
}

function optionalString(value: unknown, field: string, max = 1000): string | undefined {
  if (value === undefined) return undefined
  if (value === null) return undefined
  if (typeof value !== 'string') throw new ApiValidationError(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > max) throw new ApiValidationError(`${field} is too long`)
  return trimmed
}

function validateId(id: string, field = 'id'): string {
  if (!ID_REGEX.test(id)) throw new ApiValidationError(`Invalid ${field}`)
  return id
}

function ensureStrongPassword(password: string) {
  if (password.length < 8) {
    throw new ApiValidationError('Password must be at least 8 characters')
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new ApiValidationError('Password must include uppercase, lowercase, number, and special character')
  }
}

async function requireAuth(request: Request, env: Env): Promise<{ userId: number; username: string } | null> {
  const sessionId = getSessionId(request)
  if (!sessionId) return null
  const row = await env.DB.prepare(
    'SELECT s.user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime("now")'
  )
    .bind(sessionId)
    .first()
  if (!row) return null
  return { userId: row.user_id as number, username: row.email as string }
}

type TabRole = 'owner' | 'edit' | 'view'
type TabAccessInfo = {
  tabId: string
  ownerId: number
  ownerEmail: string
  role: TabRole
  canEdit: boolean
  canManageAccess: boolean
}

async function getTabAccess(env: Env, tabId: string, userId: number): Promise<TabAccessInfo | null> {
  const owner = (await env.DB.prepare(
    'SELECT t.user_id, u.email FROM tabs t JOIN users u ON u.id = t.user_id WHERE t.id = ?'
  ).bind(tabId).first()) as { user_id: number; email: string } | null
  if (!owner) return null
  if (owner.user_id === userId) {
    return {
      tabId,
      ownerId: owner.user_id,
      ownerEmail: owner.email,
      role: 'owner',
      canEdit: true,
      canManageAccess: true,
    }
  }
  const access = (await env.DB.prepare(
    'SELECT role FROM tab_access WHERE tab_id = ? AND user_id = ?'
  ).bind(tabId, userId).first()) as { role: 'edit' | 'view' } | null
  if (!access) return null
  return {
    tabId,
    ownerId: owner.user_id,
    ownerEmail: owner.email,
    role: access.role,
    canEdit: access.role === 'edit',
    canManageAccess: false,
  }
}

async function requireTabAccess(env: Env, tabId: string, userId: number): Promise<TabAccessInfo> {
  const access = await getTabAccess(env, tabId, userId)
  if (!access) throw new ApiValidationError('Tab not found', 404)
  return access
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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context
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
      const ipLimit = await checkRateLimit(env, request, 'auth_register_ip', 5, 60 * 60)
      if (!ipLimit.allowed) {
        const res = jsonResponse({ error: 'Too many registration attempts. Please try again later.' }, 429)
        res.headers.set('Retry-After', String(ipLimit.retryAfter))
        return addCors(res)
      }
      const body = await readJsonObject(request)
      const email = normalizeEmail(requireString(body.email, 'Email', 3, 254))
      const password = requireString(body.password, 'Password', 8, 128)
      if (!email || !password) {
        return addCors(jsonResponse({ error: 'Email and password required' }, 400))
      }
      const emailLimit = await checkRateLimit(env, request, 'auth_register_email', 3, 60 * 60, `email:${email}`)
      if (!emailLimit.allowed) {
        const res = jsonResponse({ error: 'Too many registration attempts for this email. Please try again later.' }, 429)
        res.headers.set('Retry-After', String(emailLimit.retryAfter))
        return addCors(res)
      }
      if (!EMAIL_REGEX.test(email)) {
        return addCors(jsonResponse({ error: 'Invalid email address' }, 400))
      }
      ensureStrongPassword(password)
      const hash = await hashPassword(password)
      const existingUser = (await env.DB.prepare('SELECT id FROM users WHERE email = ? AND email_verified = 1')
        .bind(email)
        .first()) as { id: number } | null
      if (existingUser) {
        return addCors(jsonResponse({ error: 'An account with this email already exists' }, 409))
      }
      await env.DB.prepare('DELETE FROM verification_codes WHERE email = ? AND type = "email_verify"')
        .bind(email)
        .run()
      const code = randomCode()
      await env.DB.prepare(
        'INSERT INTO verification_codes (email, code, type, expires_at, password_hash) VALUES (?, ?, "email_verify", datetime("now", "+24 hours"), ?)'
      )
        .bind(email, code, hash)
        .run()
      const { ok, error } = await sendEmail(
        env,
        email,
        'Verify your Codepapa TODO account',
        `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 24 hours.</p><p>If you didn't create an account, you can ignore this email.</p>`
      )
      if (!ok) {
        return addCors(jsonResponse({ error: error || 'Failed to send verification email' }, 500))
      }
      return addCors(jsonResponse({ ok: true, message: 'Check your email to verify your account' }))
    }

    if (path === '/auth/verify-email' && request.method === 'POST') {
      const limit = await checkRateLimit(env, request, 'auth_verify_email', 10, 15 * 60)
      if (!limit.allowed) {
        const res = jsonResponse({ error: 'Too many verification attempts. Please wait and try again.' }, 429)
        res.headers.set('Retry-After', String(limit.retryAfter))
        return addCors(res)
      }
      const body = await readJsonObject(request)
      const code = requireString(body.code, 'Verification code', 6, 6)
      if (!CODE_REGEX.test(code)) return addCors(jsonResponse({ error: 'Verification code must be 6 digits' }, 400))
      const row = (await env.DB.prepare(
        'SELECT email, password_hash FROM verification_codes WHERE code = ? AND type = "email_verify" AND expires_at > datetime("now")'
      )
        .bind(code)
        .first()) as { email: string; password_hash: string | null } | null
      if (!row) {
        return addCors(jsonResponse({ error: 'Invalid or expired verification code' }, 400))
      }
      if (row.password_hash) {
        try {
          await env.DB.prepare('INSERT INTO users (email, email_verified, password_hash) VALUES (?, 1, ?)')
            .bind(row.email, row.password_hash)
            .run()
        } catch (e: unknown) {
          if (String(e).includes('UNIQUE')) {
            await env.DB.prepare('UPDATE users SET email_verified = 1, password_hash = ? WHERE email = ?')
              .bind(row.password_hash, row.email)
              .run()
          } else throw e
        }
      } else {
        await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE email = ?')
          .bind(row.email)
          .run()
      }
      await env.DB.prepare('DELETE FROM verification_codes WHERE code = ? AND type = "email_verify"')
        .bind(code)
        .run()
      const user = (await env.DB.prepare('SELECT id, email, accent_color FROM users WHERE email = ?')
        .bind(row.email)
        .first()) as { id: number; email: string; accent_color: string | null }
      const sessionId = randomId()
      await env.DB.prepare(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+30 days"))'
      )
        .bind(sessionId, user.id)
        .run()
      const accent = user.accent_color ?? '#7c5cff'
      const res = jsonResponse({ user: { id: user.id, username: user.email, accent_color: accent } })
      return addCors(setSessionCookie(res, sessionId))
    }

    if (path === '/auth/login' && request.method === 'POST') {
      const ipLimit = await checkRateLimit(env, request, 'auth_login_ip', 10, 15 * 60)
      if (!ipLimit.allowed) {
        const res = jsonResponse({ error: 'Too many login attempts. Please wait and try again.' }, 429)
        res.headers.set('Retry-After', String(ipLimit.retryAfter))
        return addCors(res)
      }
      const body = await readJsonObject(request)
      const email = normalizeEmail(requireString(body.email, 'Email', 3, 254))
      const password = requireString(body.password, 'Password', 1, 128)
      if (!email || !password) {
        return addCors(jsonResponse({ error: 'Email and password required' }, 400))
      }
      const emailLimit = await checkRateLimit(env, request, 'auth_login_email', 8, 15 * 60, `email:${email}`)
      if (!emailLimit.allowed) {
        const res = jsonResponse({ error: 'Too many login attempts for this email. Please wait and try again.' }, 429)
        res.headers.set('Retry-After', String(emailLimit.retryAfter))
        return addCors(res)
      }
      const user = (await env.DB.prepare('SELECT id, email, email_verified, password_hash, accent_color FROM users WHERE email = ?')
        .bind(email)
        .first()) as { id: number; email: string; email_verified: number; password_hash: string; accent_color: string | null }
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return addCors(jsonResponse({ error: 'Invalid email or password' }, 401))
      }
      if (!user.email_verified) {
        return addCors(jsonResponse({ error: 'Please verify your email first. Check your inbox for the verification code.' }, 403))
      }
      const sessionId = randomId()
      await env.DB.prepare(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+30 days"))'
      )
        .bind(sessionId, user.id)
        .run()
      const accent = user.accent_color ?? '#7c5cff'
      const res = jsonResponse({ user: { id: user.id, username: user.email, accent_color: accent } })
      return addCors(setSessionCookie(res, sessionId))
    }

    if (path === '/auth/forgot-password' && request.method === 'POST') {
      const ipLimit = await checkRateLimit(env, request, 'auth_forgot_password_ip', 5, 60 * 60)
      if (!ipLimit.allowed) {
        const res = jsonResponse({ error: 'Too many reset requests. Please try again later.' }, 429)
        res.headers.set('Retry-After', String(ipLimit.retryAfter))
        return addCors(res)
      }
      const body = await readJsonObject(request)
      const email = normalizeEmail(requireString(body.email, 'Email', 3, 254))
      if (!email) {
        return addCors(jsonResponse({ error: 'Email required' }, 400))
      }
      const emailLimit = await checkRateLimit(env, request, 'auth_forgot_password_email', 3, 60 * 60, `email:${email}`)
      if (!emailLimit.allowed) {
        const res = jsonResponse({ error: 'Too many reset requests for this email. Please try again later.' }, 429)
        res.headers.set('Retry-After', String(emailLimit.retryAfter))
        return addCors(res)
      }
      const user = (await env.DB.prepare('SELECT id FROM users WHERE email = ?')
        .bind(email)
        .first()) as { id: number } | null
      if (user) {
        const code = randomCode()
        await env.DB.prepare('DELETE FROM verification_codes WHERE email = ? AND type = "password_reset"')
          .bind(email)
          .run()
        await env.DB.prepare(
          'INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, "password_reset", datetime("now", "+1 hour"))'
        )
          .bind(email, code)
          .run()
        const { ok, error } = await sendEmail(
          env,
          email,
          'Reset your Codepapa TODO password',
          `<p>Your password reset code is: <strong>${code}</strong></p><p>It expires in 1 hour.</p><p>If you didn't request this, you can ignore this email.</p>`
        )
        if (!ok) {
          return addCors(jsonResponse({ error: error || 'Failed to send reset email' }, 500))
        }
      }
      return addCors(jsonResponse({ ok: true, message: 'If an account exists, you will receive a reset code by email' }))
    }

    if (path === '/auth/reset-password' && request.method === 'POST') {
      const ipLimit = await checkRateLimit(env, request, 'auth_reset_password_ip', 10, 60 * 60)
      if (!ipLimit.allowed) {
        const res = jsonResponse({ error: 'Too many password reset attempts. Please wait and try again.' }, 429)
        res.headers.set('Retry-After', String(ipLimit.retryAfter))
        return addCors(res)
      }
      const body = await readJsonObject(request)
      const email = normalizeEmail(requireString(body.email, 'Email', 3, 254))
      const code = requireString(body.code, 'Reset code', 6, 6)
      const password = requireString(body.password, 'Password', 8, 128)
      if (!email || !code || !password) {
        return addCors(jsonResponse({ error: 'Email, code, and new password required' }, 400))
      }
      if (!CODE_REGEX.test(code)) return addCors(jsonResponse({ error: 'Reset code must be 6 digits' }, 400))
      ensureStrongPassword(password)
      const emailLimit = await checkRateLimit(env, request, 'auth_reset_password_email', 6, 60 * 60, `email:${email}`)
      if (!emailLimit.allowed) {
        const res = jsonResponse({ error: 'Too many password reset attempts for this email. Please wait and try again.' }, 429)
        res.headers.set('Retry-After', String(emailLimit.retryAfter))
        return addCors(res)
      }
      const row = (await env.DB.prepare(
        'SELECT email FROM verification_codes WHERE email = ? AND code = ? AND type = "password_reset" AND expires_at > datetime("now")'
      )
        .bind(email, code)
        .first()) as { email: string } | null
      if (!row) {
        return addCors(jsonResponse({ error: 'Invalid or expired reset code' }, 400))
      }
      const user = (await env.DB.prepare('SELECT id FROM users WHERE email = ?')
        .bind(email)
        .first()) as { id: number } | null
      if (!user) return addCors(jsonResponse({ error: 'Account not found' }, 400))
      const hash = await hashPassword(password)
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .bind(hash, user.id)
        .run()
      await env.DB.prepare('DELETE FROM verification_codes WHERE email = ? AND code = ? AND type = "password_reset"')
        .bind(email, code)
        .run()
      return addCors(jsonResponse({ ok: true }))
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
      const user = (await env.DB.prepare('SELECT id, email, accent_color FROM users WHERE id = ?')
        .bind(auth.userId)
        .first()) as { id: number; email: string; accent_color: string | null } | null
      const accent = user?.accent_color ?? '#7c5cff'
      return addCors(jsonResponse({ user: { id: auth.userId, username: auth.username, accent_color: accent } }))
    }

    if (path === '/auth/settings' && request.method === 'PUT') {
      const auth = await requireAuth(request, env)
      if (!auth) return addCors(jsonResponse({ error: 'Unauthorized' }, 401))
      const body = await readJsonObject(request)
      const accent = optionalString(body.accent_color, 'accent_color', 7)
      const hex = /^#[0-9A-Fa-f]{6}$/.test(accent ?? '') ? accent : '#7c5cff'
      await env.DB.prepare('UPDATE users SET accent_color = ? WHERE id = ?')
        .bind(hex, auth.userId)
        .run()
      return addCors(jsonResponse({ user: { id: auth.userId, username: auth.username, accent_color: hex } }))
    }

    if (path === '/auth/delete-account-request' && request.method === 'POST') {
      const auth = await requireAuth(request, env)
      if (!auth) return addCors(jsonResponse({ error: 'Unauthorized' }, 401))
      const email = auth.username
      const code = randomCode()
      await env.DB.prepare('DELETE FROM verification_codes WHERE email = ? AND type = "account_delete"')
        .bind(email)
        .run()
      await env.DB.prepare(
        'INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, "account_delete", datetime("now", "+1 hour"))'
      )
        .bind(email, code)
        .run()
      const { ok, error } = await sendEmail(
        env,
        email,
        'Confirm account deletion – Codepapa TODO',
        `<p>Your account deletion code is: <strong>${code}</strong></p><p>It expires in 1 hour.</p><p>If you didn't request this, secure your account immediately.</p>`
      )
      if (!ok) {
        return addCors(jsonResponse({ error: error || 'Failed to send confirmation email' }, 500))
      }
      return addCors(jsonResponse({ ok: true, message: 'Check your email for the confirmation code' }))
    }

    if (path === '/auth/delete-account' && request.method === 'POST') {
      const auth = await requireAuth(request, env)
      if (!auth) return addCors(jsonResponse({ error: 'Unauthorized' }, 401))
      const body = await readJsonObject(request)
      const code = requireString(body.code, 'Confirmation code', 6, 6)
      if (!code) return addCors(jsonResponse({ error: 'Confirmation code required' }, 400))
      if (!CODE_REGEX.test(code)) return addCors(jsonResponse({ error: 'Confirmation code must be 6 digits' }, 400))
      const row = (await env.DB.prepare(
        'SELECT email FROM verification_codes WHERE email = ? AND code = ? AND type = "account_delete" AND expires_at > datetime("now")'
      )
        .bind(auth.username, code)
        .first()) as { email: string } | null
      if (!row) {
        return addCors(jsonResponse({ error: 'Invalid or expired confirmation code' }, 400))
      }
      const { userId } = auth
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM tab_access WHERE user_id = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM tab_access WHERE tab_id IN (SELECT id FROM tabs WHERE user_id = ?)').bind(userId).run()
      await env.DB.prepare('DELETE FROM tab_invitations WHERE invited_by = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM tab_invitations WHERE email = ?').bind(auth.username).run()
      await env.DB.prepare('DELETE FROM tasks WHERE user_id = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM completed_tasks WHERE user_id = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM deleted_tasks WHERE user_id = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM tabs WHERE user_id = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(userId).run()
      await env.DB.prepare('DELETE FROM verification_codes WHERE email = ?').bind(auth.username).run()
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
      const res = jsonResponse({ ok: true })
      const headers = new Headers(res.headers)
      headers.append('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0')
      return addCors(new Response(res.body, { status: res.status, headers }))
    }

    const auth = await requireAuth(request, env)
    if (!auth) return addCors(jsonResponse({ error: 'Unauthorized' }, 401))

    const { userId } = auth
    if (path === '/daily' && request.method === 'GET') {
      const day = dayFromQuery(url.searchParams.get('day'))
      const rows = await env.DB.prepare(
        `SELECT d.id, d.text,
           EXISTS(
             SELECT 1 FROM daily_task_completions c
             WHERE c.daily_task_id = d.id AND c.user_id = d.user_id AND c.day = ?
           ) as completed_today
         FROM daily_tasks d
         WHERE d.user_id = ?
         ORDER BY d.created_at ASC`
      )
        .bind(day, userId)
        .all()
      const tasks = await Promise.all(
        (rows.results as { id: string; text: string; completed_today: number }[]).map(async (r) => ({
          id: r.id,
          text: await decrypt(r.text, env),
          completedToday: !!r.completed_today,
        }))
      )
      return addCors(jsonResponse({ tasks }))
    }

    if (path === '/daily' && request.method === 'POST') {
      const body = await readJsonObject(request)
      const text = requireString(body.text, 'text', 1, 500)
      const id = randomId()
      const encryptedText = await encrypt(text, env)
      await env.DB.prepare('INSERT INTO daily_tasks (id, user_id, text) VALUES (?, ?, ?)')
        .bind(id, userId, encryptedText)
        .run()
      return addCors(jsonResponse({ task: { id, text, completedToday: false } }))
    }

    if (path.startsWith('/daily/') && path.endsWith('/complete') && request.method === 'POST') {
      const taskId = validateId(path.slice(7, -9), 'daily task id')
      const body = await readJsonObject(request)
      if (typeof body.completed !== 'boolean') {
        return addCors(jsonResponse({ error: 'completed must be a boolean' }, 400))
      }
      const day = body.day === undefined ? todayUtc() : requireString(body.day, 'day', 10, 10)
      if (!DAY_REGEX.test(day)) return addCors(jsonResponse({ error: 'day must be YYYY-MM-DD' }, 400))
      const exists = (await env.DB.prepare('SELECT id FROM daily_tasks WHERE id = ? AND user_id = ?')
        .bind(taskId, userId)
        .first()) as { id: string } | null
      if (!exists) return addCors(jsonResponse({ error: 'Daily task not found' }, 404))
      if (body.completed) {
        await env.DB.prepare(
          `INSERT INTO daily_task_completions (daily_task_id, user_id, day, completed_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(daily_task_id, user_id, day)
           DO UPDATE SET completed_at = datetime('now')`
        )
          .bind(taskId, userId, day)
          .run()
      } else {
        await env.DB.prepare('DELETE FROM daily_task_completions WHERE daily_task_id = ? AND user_id = ? AND day = ?')
          .bind(taskId, userId, day)
          .run()
      }
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/daily/') && request.method === 'DELETE') {
      const taskId = validateId(path.slice(7), 'daily task id')
      await env.DB.prepare('DELETE FROM daily_task_completions WHERE daily_task_id = ? AND user_id = ?')
        .bind(taskId, userId)
        .run()
      const result = await env.DB.prepare('DELETE FROM daily_tasks WHERE id = ? AND user_id = ?')
        .bind(taskId, userId)
        .run()
      if (!result.success) return addCors(jsonResponse({ error: 'Failed to delete task' }, 500))
      return addCors(jsonResponse({ ok: true }))
    }

    if (path === '/daily/stats' && request.method === 'GET') {
      const rawDays = Number(url.searchParams.get('days') || '30')
      const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(365, Math.floor(rawDays))) : 30
      const today = dayFromQuery(url.searchParams.get('today'), 'today')
      const startDay = dayFromQuery(url.searchParams.get('startDay'), 'startDay')

      const totalRow = (await env.DB.prepare('SELECT COUNT(*) as c FROM daily_tasks WHERE user_id = ?')
        .bind(userId)
        .first()) as { c: number } | null
      const completedTodayRow = (await env.DB.prepare(
        'SELECT COUNT(*) as c FROM daily_task_completions WHERE user_id = ? AND day = ?'
      )
        .bind(userId, today)
        .first()) as { c: number } | null

      const byDayRows = (await env.DB.prepare(
        `SELECT day, COUNT(*) as completed
         FROM daily_task_completions
         WHERE user_id = ? AND day >= ?
         GROUP BY day
         ORDER BY day DESC`
      )
        .bind(userId, startDay)
        .all()).results as { day: string; completed: number }[]

      const byTaskRows = (await env.DB.prepare(
        `SELECT d.id, d.text, COUNT(c.day) as completed_days
         FROM daily_tasks d
         LEFT JOIN daily_task_completions c
           ON c.daily_task_id = d.id
           AND c.user_id = d.user_id
           AND c.day >= ?
         WHERE d.user_id = ?
         GROUP BY d.id, d.text
         ORDER BY completed_days DESC, d.created_at ASC`
      )
        .bind(startDay, userId)
        .all()).results as { id: string; text: string; completed_days: number }[]

      const byTask = await Promise.all(
        byTaskRows.map(async (r) => ({
          id: r.id,
          text: await decrypt(r.text, env),
          completedDays: r.completed_days ?? 0,
        }))
      )

      const totalTasks = totalRow?.c ?? 0
      const completedToday = completedTodayRow?.c ?? 0
      const completionRateToday = totalTasks ? Math.round((completedToday / totalTasks) * 100) : 0

      return addCors(
        jsonResponse({
          summary: { totalTasks, completedToday, completionRateToday },
          byDay: byDayRows,
          byTask,
        })
      )
    }

    if (path === '/tabs' && request.method === 'GET') {
      let ownRows = await env.DB.prepare('SELECT id, name, "order", user_id FROM tabs WHERE user_id = ? ORDER BY "order"')
        .bind(userId)
        .all()
      if (ownRows.results.length === 0) {
        const id = randomId()
        const encryptedName = await encrypt('My Tasks', env)
        await env.DB.prepare('INSERT INTO tabs (id, user_id, name, "order") VALUES (?, ?, ?, 0)')
          .bind(id, userId, encryptedName)
          .run()
        ownRows = await env.DB.prepare('SELECT id, name, "order", user_id FROM tabs WHERE user_id = ? ORDER BY "order"')
          .bind(userId)
          .all()
      }
      const sharedRows = await env.DB.prepare(
        `SELECT t.id, t.name, t.user_id, a.role, u.email as owner_email
         FROM tab_access a
         JOIN tabs t ON t.id = a.tab_id
         JOIN users u ON u.id = t.user_id
         WHERE a.user_id = ?
         ORDER BY t.created_at DESC`
      ).bind(userId).all()
      const ownTabs = await Promise.all(
        (ownRows.results as { id: string; name: string; order: number; user_id: number }[]).map(async (t, idx) => ({
          id: t.id,
          name: await decrypt(t.name, env),
          order: idx,
          accessRole: 'owner' as TabRole,
          isOwner: true,
          ownerEmail: auth.username,
        }))
      )
      const sharedTabs = await Promise.all(
        (sharedRows.results as { id: string; name: string; role: 'edit' | 'view'; owner_email: string }[]).map(async (t, idx) => ({
          id: t.id,
          name: await decrypt(t.name, env),
          order: ownTabs.length + idx,
          accessRole: t.role,
          isOwner: false,
          ownerEmail: t.owner_email,
        }))
      )
      return addCors(jsonResponse({ tabs: [...ownTabs, ...sharedTabs] }))
    }

    if (path === '/tabs' && request.method === 'POST') {
      const body = await readJsonObject(request)
      const name = requireString(body.name, 'Tab name', 1, 80)
      if (!name) return addCors(jsonResponse({ error: 'Tab name required' }, 400))
      const count = (await env.DB.prepare('SELECT COUNT(*) as c FROM tabs WHERE user_id = ?').bind(userId).first()) as { c: number }
      const order = (count?.c ?? 0)
      const id = randomId()
      const encryptedName = await encrypt(name, env)
      await env.DB.prepare('INSERT INTO tabs (id, user_id, name, "order") VALUES (?, ?, ?, ?)')
        .bind(id, userId, encryptedName, order)
        .run()
      return addCors(jsonResponse({ tab: { id, name, order } }))
    }

    if (path === '/tabs/reorder' && request.method === 'PUT') {
      const body = await readJsonObject(request)
      const tabIdsRaw = body.tabIds
      if (!Array.isArray(tabIdsRaw)) return addCors(jsonResponse({ error: 'tabIds must be an array' }, 400))
      const tabIds = tabIdsRaw.map((id) => {
        if (typeof id !== 'string') throw new ApiValidationError('tabIds must contain string ids')
        return validateId(id, 'tab id')
      })
      if (!tabIds?.length) return addCors(jsonResponse({ error: 'tabIds required' }, 400))
      const userTabs = (await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order"').bind(userId).all()).results as { id: string }[]
      const validIds = new Set(userTabs.map((t) => t.id))
      const filtered = tabIds.filter((id) => validIds.has(id))
      if (filtered.length !== userTabs.length) return addCors(jsonResponse({ error: 'Can only reorder owned tabs' }, 400))
      for (let i = 0; i < filtered.length; i++) {
        await env.DB.prepare('UPDATE tabs SET "order" = ? WHERE id = ? AND user_id = ?')
          .bind(i, filtered[i], userId)
          .run()
      }
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tabs/') && path.endsWith('/invite') && request.method === 'POST') {
      const tabId = validateId(path.slice(6, -7), 'tab id')
      const access = await requireTabAccess(env, tabId, userId)
      if (!access.canManageAccess) return addCors(jsonResponse({ error: 'Only tab owner can invite users' }, 403))
      const body = await readJsonObject(request)
      const email = normalizeEmail(requireString(body.email, 'Email', 3, 254))
      const role = requireString(body.role, 'role', 4, 4)
      if (!EMAIL_REGEX.test(email)) return addCors(jsonResponse({ error: 'Invalid email address' }, 400))
      if (role !== 'edit' && role !== 'view') return addCors(jsonResponse({ error: 'role must be edit or view' }, 400))
      if (email === access.ownerEmail) return addCors(jsonResponse({ error: 'Owner already has access' }, 400))
      const existingMember = (await env.DB.prepare(
        `SELECT a.id
         FROM tab_access a
         JOIN users u ON u.id = a.user_id
         WHERE a.tab_id = ? AND u.email = ?`
      ).bind(tabId, email).first()) as { id: string } | null
      if (existingMember) return addCors(jsonResponse({ error: 'User already has access to this tab' }, 400))
      await env.DB.prepare('DELETE FROM tab_invitations WHERE tab_id = ? AND email = ?')
        .bind(tabId, email)
        .run()
      const inviteId = randomId()
      await env.DB.prepare('INSERT INTO tab_invitations (id, tab_id, email, role, invited_by) VALUES (?, ?, ?, ?, ?)')
        .bind(inviteId, tabId, email, role, userId)
        .run()
      const tab = (await env.DB.prepare('SELECT name FROM tabs WHERE id = ?').bind(tabId).first()) as { name: string } | null
      const tabName = tab ? await decrypt(tab.name, env) : 'a tab'
      const inviteLink = `${url.origin}/?invite=${inviteId}`
      const sent = await sendEmail(
        env,
        email,
        `Invitation to shared tab: ${tabName}`,
        `<p>You were invited to collaborate on tab <strong>${tabName}</strong>.</p>
         <p>Access: <strong>${role}</strong></p>
         <p><a href="${inviteLink}">Open invitation</a> to confirm or decline.</p>
         <p>For security, you still need to confirm inside PrivateTodo after opening the link.</p>`
      )
      if (!sent.ok) return addCors(jsonResponse({ error: sent.error || 'Failed to send invitation email' }, 500))
      return addCors(jsonResponse({ ok: true }))
    }

    if (path === '/tab-invitations' && request.method === 'GET') {
      const rows = (await env.DB.prepare(
        `SELECT i.id, i.tab_id, i.role, i.email, t.name as tab_name, u.email as owner_email
         FROM tab_invitations i
         JOIN tabs t ON t.id = i.tab_id
         JOIN users u ON u.id = t.user_id
         WHERE i.email = ?
         ORDER BY i.created_at DESC`
      ).bind(auth.username).all()).results as {
        id: string
        tab_id: string
        role: 'edit' | 'view'
        email: string
        tab_name: string
        owner_email: string
      }[]
      const invites = await Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          tabId: row.tab_id,
          tabName: await decrypt(row.tab_name, env),
          ownerEmail: row.owner_email,
          role: row.role,
          email: row.email,
        }))
      )
      return addCors(jsonResponse({ invites }))
    }

    if (path.startsWith('/tab-invitations/') && path.endsWith('/accept') && request.method === 'POST') {
      const inviteId = validateId(path.slice(17, -7), 'invitation id')
      const invite = (await env.DB.prepare(
        'SELECT id, tab_id, role, invited_by FROM tab_invitations WHERE id = ? AND email = ?'
      ).bind(inviteId, auth.username).first()) as { id: string; tab_id: string; role: 'edit' | 'view'; invited_by: number } | null
      if (!invite) return addCors(jsonResponse({ error: 'Invitation not found' }, 404))
      await env.DB.prepare(
        `INSERT INTO tab_access (id, tab_id, user_id, role, invited_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(tab_id, user_id) DO UPDATE SET role = excluded.role, invited_by = excluded.invited_by`
      )
        .bind(randomId(), invite.tab_id, userId, invite.role, invite.invited_by)
        .run()
      await env.DB.prepare('DELETE FROM tab_invitations WHERE id = ?').bind(inviteId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tab-invitations/') && path.endsWith('/decline') && request.method === 'POST') {
      const inviteId = validateId(path.slice(17, -8), 'invitation id')
      const result = await env.DB.prepare('DELETE FROM tab_invitations WHERE id = ? AND email = ?')
        .bind(inviteId, auth.username)
        .run()
      if (!result.success) return addCors(jsonResponse({ error: 'Failed to decline invitation' }, 500))
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tabs/') && path.endsWith('/access') && request.method === 'GET') {
      const tabId = validateId(path.slice(6, -7), 'tab id')
      const access = await requireTabAccess(env, tabId, userId)
      if (!access.canManageAccess) return addCors(jsonResponse({ error: 'Only tab owner can view access list' }, 403))
      const membersRows = (await env.DB.prepare(
        `SELECT a.id, a.role, u.email
         FROM tab_access a
         JOIN users u ON u.id = a.user_id
         WHERE a.tab_id = ?
         ORDER BY u.email ASC`
      ).bind(tabId).all()).results as { id: string; role: 'edit' | 'view'; email: string }[]
      const inviteRows = (await env.DB.prepare(
        `SELECT id, email, role
         FROM tab_invitations
         WHERE tab_id = ?
         ORDER BY email ASC`
      ).bind(tabId).all()).results as { id: string; email: string; role: 'edit' | 'view' }[]
      return addCors(jsonResponse({
        members: [{ id: `owner:${tabId}`, email: access.ownerEmail, role: 'owner' as TabRole }, ...membersRows],
        invites: inviteRows,
      }))
    }

    if (path.startsWith('/tabs/') && path.includes('/access/') && request.method === 'PUT') {
      const [tabPart, accessId] = path.slice(6).split('/access/')
      const tabId = validateId(tabPart, 'tab id')
      const access = await requireTabAccess(env, tabId, userId)
      if (!access.canManageAccess) return addCors(jsonResponse({ error: 'Only tab owner can edit access' }, 403))
      const body = await readJsonObject(request)
      const role = requireString(body.role, 'role', 4, 4)
      if (role !== 'edit' && role !== 'view') return addCors(jsonResponse({ error: 'role must be edit or view' }, 400))
      await env.DB.prepare('UPDATE tab_access SET role = ? WHERE id = ? AND tab_id = ?')
        .bind(role, accessId, tabId)
        .run()
      await env.DB.prepare('UPDATE tab_invitations SET role = ? WHERE id = ? AND tab_id = ?')
        .bind(role, accessId, tabId)
        .run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tabs/') && path.includes('/access/') && request.method === 'DELETE') {
      const [tabPart, accessId] = path.slice(6).split('/access/')
      const tabId = validateId(tabPart, 'tab id')
      const access = await requireTabAccess(env, tabId, userId)
      if (!access.canManageAccess) return addCors(jsonResponse({ error: 'Only tab owner can remove access' }, 403))
      await env.DB.prepare('DELETE FROM tab_access WHERE id = ? AND tab_id = ?').bind(accessId, tabId).run()
      await env.DB.prepare('DELETE FROM tab_invitations WHERE id = ? AND tab_id = ?').bind(accessId, tabId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tabs/') && path.endsWith('/leave') && request.method === 'POST') {
      const tabId = validateId(path.slice(6, -6), 'tab id')
      const access = await requireTabAccess(env, tabId, userId)
      if (access.role === 'owner') return addCors(jsonResponse({ error: 'Owner cannot leave own tab' }, 400))
      await env.DB.prepare('DELETE FROM tab_access WHERE tab_id = ? AND user_id = ?').bind(tabId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tabs/') && request.method === 'PUT') {
      const tabId = validateId(path.slice(6), 'tab id')
      const body = await readJsonObject(request)
      const name = requireString(body.name, 'Tab name', 1, 80)
      if (!name) return addCors(jsonResponse({ error: 'Tab name required' }, 400))
      const access = await requireTabAccess(env, tabId, userId)
      if (!access.canEdit) return addCors(jsonResponse({ error: 'No permission to rename this tab' }, 403))
      const encryptedName = await encrypt(name, env)
      await env.DB.prepare('UPDATE tabs SET name = ? WHERE id = ?')
        .bind(encryptedName, tabId)
        .run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tabs/') && request.method === 'DELETE') {
      const tabId = validateId(path.slice(6), 'tab id')
      const access = await requireTabAccess(env, tabId, userId)
      if (access.role !== 'owner') return addCors(jsonResponse({ error: 'Only owner can delete tab' }, 403))
      const tabs = (await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order"').bind(userId).all()).results as { id: string }[]
      if (tabs.length <= 1) return addCors(jsonResponse({ error: 'Cannot delete last tab' }, 400))
      const targetTabId = tabs.find((t) => t.id !== tabId)?.id ?? tabs[0].id
      await env.DB.prepare('UPDATE tasks SET tab_id = ? WHERE tab_id = ? AND user_id = ?')
        .bind(targetTabId, tabId, userId)
        .run()
      await env.DB.prepare('DELETE FROM tab_access WHERE tab_id = ?').bind(tabId).run()
      await env.DB.prepare('DELETE FROM tab_invitations WHERE tab_id = ?').bind(tabId).run()
      await env.DB.prepare('DELETE FROM tabs WHERE id = ? AND user_id = ?').bind(tabId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path === '/tasks' && request.method === 'GET') {
      const tabId = url.searchParams.get('tabId')
      if (!tabId) return addCors(jsonResponse({ error: 'tabId required' }, 400))
      validateId(tabId, 'tab id')
      await requireTabAccess(env, tabId, userId)
      const rows = await env.DB.prepare(
        'SELECT id, text, completed, completed_at, "order", note, deadline FROM tasks WHERE tab_id = ? ORDER BY "order"'
      )
        .bind(tabId)
        .all()
      const tasks = await Promise.all(
        (rows.results as { id: string; text: string; completed: number; completed_at: string | null; order: number; note: string | null; deadline: string | null }[]).map(
          async (t) => ({
            ...t,
            text: await decrypt(t.text, env),
            note: t.note ? await decrypt(t.note, env) : null,
          })
        )
      )
      return addCors(jsonResponse({ tasks }))
    }

    if (path === '/tasks' && request.method === 'POST') {
      const createTaskLimit = await checkRateLimit(env, null, 'tasks_create_user', 5, 1, `user:${userId}`)
      if (!createTaskLimit.allowed) {
        const res = jsonResponse({ error: 'Too many tasks created too quickly. Please slow down.' }, 429)
        res.headers.set('Retry-After', String(createTaskLimit.retryAfter))
        return addCors(res)
      }
      const body = await readJsonObject(request)
      const tabId = validateId(requireString(body.tabId, 'tabId', 32, 32), 'tab id')
      const text = requireString(body.text, 'text', 1, 500)
      if (!tabId || !text?.trim()) return addCors(jsonResponse({ error: 'tabId and text required' }, 400))
      const access = await requireTabAccess(env, tabId, userId)
      if (!access.canEdit) return addCors(jsonResponse({ error: 'No permission to create tasks in this tab' }, 403))
      const dl = optionalString(body.deadline, 'deadline', 16)
      const deadline = dl && (/^\d{4}-\d{2}-\d{2}$/.test(dl) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dl)) ? dl : null
      await bumpTaskOrdersForTab(env, access.ownerId, tabId)
      const order = 0
      const id = randomId()
      const encryptedText = await encrypt(text.trim(), env)
      await env.DB.prepare(
        'INSERT INTO tasks (id, user_id, tab_id, text, "order", deadline) VALUES (?, ?, ?, ?, ?, ?)'
      )
        .bind(id, access.ownerId, tabId, encryptedText, order, deadline)
        .run()
      return addCors(jsonResponse({ task: { id, text: text.trim(), completed: 0, completed_at: null, order, note: null, deadline } }))
    }

    if (path === '/tasks/reorder' && request.method === 'PUT') {
      const body = await readJsonObject(request)
      const tabId = validateId(requireString(body.tabId, 'tabId', 32, 32), 'tab id')
      const taskIdsRaw = body.taskIds
      if (!Array.isArray(taskIdsRaw)) return addCors(jsonResponse({ error: 'taskIds must be an array' }, 400))
      const taskIds = taskIdsRaw.map((id) => {
        if (typeof id !== 'string') throw new ApiValidationError('taskIds must contain string ids')
        return validateId(id, 'task id')
      })
      if (!tabId || !taskIds?.length) return addCors(jsonResponse({ error: 'tabId and taskIds required' }, 400))
      const access = await requireTabAccess(env, tabId, userId)
      if (!access.canEdit) return addCors(jsonResponse({ error: 'No permission to reorder tasks in this tab' }, 403))
      for (let i = 0; i < taskIds.length; i++) {
        await env.DB.prepare('UPDATE tasks SET "order" = ? WHERE id = ? AND tab_id = ?')
          .bind(i, taskIds[i], tabId)
          .run()
      }
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tasks/') && request.method === 'PUT') {
      const taskId = validateId(path.slice(7), 'task id')
      const body = await readJsonObject(request)
      const task = (await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first()) as { id: string; tab_id: string } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      const access = await requireTabAccess(env, task.tab_id, userId)
      if (!access.canEdit) return addCors(jsonResponse({ error: 'No permission to edit this task' }, 403))
      if (body.text !== undefined) {
        const text = requireString(body.text, 'text', 1, 500)
        const encryptedText = await encrypt(text, env)
        await env.DB.prepare('UPDATE tasks SET text = ? WHERE id = ?').bind(encryptedText, taskId).run()
      }
      if (body.completed !== undefined) {
        if (typeof body.completed !== 'boolean') return addCors(jsonResponse({ error: 'completed must be a boolean' }, 400))
        const completedAt = body.completed ? new Date().toISOString() : null
        await env.DB.prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?')
          .bind(body.completed ? 1 : 0, completedAt, taskId)
          .run()
        if (body.completed) {
          const t = (await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first()) as { text: string; note: string | null; tab_id: string; created_at: string; deadline: string | null }
          const tab = (await env.DB.prepare('SELECT name FROM tabs WHERE id = ?').bind(t.tab_id).first()) as { name: string } | null
          await env.DB.prepare(
            'INSERT INTO completed_tasks (id, user_id, tab_id, tab_name, text, note, deadline, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
            .bind(taskId, userId, t.tab_id, tab?.name ?? '', t.text, t.note, t.deadline ?? null, completedAt, t.created_at)
            .run()
          await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run()
        }
      }
      if (body.note !== undefined) {
        if (body.note !== null && typeof body.note !== 'string') return addCors(jsonResponse({ error: 'note must be a string or null' }, 400))
        const note = body.note === null ? null : optionalString(body.note, 'note', 5000) ?? ''
        const encryptedNote = note ? await encrypt(note, env) : null
        await env.DB.prepare('UPDATE tasks SET note = ? WHERE id = ?').bind(encryptedNote, taskId).run()
      }
      if (body.deadline !== undefined) {
        if (body.deadline !== null && typeof body.deadline !== 'string') return addCors(jsonResponse({ error: 'deadline must be a string or null' }, 400))
        const dl = body.deadline
        const deadline = dl && (/^\d{4}-\d{2}-\d{2}$/.test(dl) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dl)) ? dl : null
        await env.DB.prepare('UPDATE tasks SET deadline = ? WHERE id = ?').bind(deadline, taskId).run()
      }
      if (body.order !== undefined) {
        if (typeof body.order !== 'number' || !Number.isInteger(body.order) || body.order < 0) {
          return addCors(jsonResponse({ error: 'order must be a non-negative integer' }, 400))
        }
        await env.DB.prepare('UPDATE tasks SET "order" = ? WHERE id = ?').bind(body.order, taskId).run()
      }
      if (body.tabId !== undefined) {
        if (typeof body.tabId !== 'string') return addCors(jsonResponse({ error: 'tabId must be a string' }, 400))
        const targetTabId = validateId(body.tabId, 'tab id')
        const targetAccess = await getTabAccess(env, targetTabId, userId)
        if (!targetAccess) return addCors(jsonResponse({ error: 'Target tab not found' }, 404))
        if (!targetAccess.canEdit) return addCors(jsonResponse({ error: 'No permission to move to target tab' }, 403))
        await bumpTaskOrdersForTab(env, targetAccess.ownerId, targetTabId)
        await env.DB.prepare('UPDATE tasks SET user_id = ?, tab_id = ?, "order" = 0 WHERE id = ?')
          .bind(targetAccess.ownerId, targetTabId, taskId)
          .run()
      }
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/tasks/') && request.method === 'DELETE') {
      const taskId = validateId(path.slice(7), 'task id')
      const task = (await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first()) as { text: string; note: string | null; tab_id: string; created_at: string; deadline: string | null } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      const access = await requireTabAccess(env, task.tab_id, userId)
      if (!access.canEdit) return addCors(jsonResponse({ error: 'No permission to delete this task' }, 403))
      const tab = (await env.DB.prepare('SELECT name FROM tabs WHERE id = ?').bind(task.tab_id).first()) as { name: string } | null
      await env.DB.prepare(
        'INSERT INTO deleted_tasks (id, user_id, tab_id, tab_name, text, note, deadline, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(taskId, userId, task.tab_id, tab?.name ?? '', task.text, task.note, task.deadline ?? null, new Date().toISOString(), task.created_at)
        .run()
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path === '/history/completed' && request.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT id, text, note, tab_name, completed_at, created_at FROM completed_tasks WHERE user_id = ? ORDER BY completed_at DESC'
      )
        .bind(userId)
        .all()
      const tasks = await Promise.all(
        (rows.results as { id: string; text: string; note: string | null; tab_name: string | null; completed_at: string; created_at: string | null }[]).map(
          async (t) => ({
            ...t,
            text: await decrypt(t.text, env),
            note: t.note ? await decrypt(t.note, env) : null,
            tab_name: t.tab_name ? await decrypt(t.tab_name, env) : null,
          })
        )
      )
      return addCors(jsonResponse({ tasks }))
    }

    if (path.endsWith('/to-deleted') && path.startsWith('/history/completed/') && request.method === 'POST') {
      const taskId = validateId(path.slice(19, path.length - 11), 'task id')
      const task = (await env.DB.prepare('SELECT * FROM completed_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string | null; tab_name: string; deadline: string | null; created_at: string | null } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      await env.DB.prepare(
        'INSERT INTO deleted_tasks (id, user_id, tab_id, tab_name, text, note, deadline, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(taskId, userId, task.tab_id ?? '', task.tab_name ?? '', task.text, task.note, task.deadline ?? null, new Date().toISOString(), task.created_at)
        .run()
      await env.DB.prepare('DELETE FROM completed_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/history/completed/') && request.method === 'POST') {
      const taskId = validateId(path.slice(19), 'task id')
      const body = await readJsonObject(request)
      const task = (await env.DB.prepare('SELECT * FROM completed_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string | null; tab_name: string; deadline: string | null } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      let tabId = typeof body.tabId === 'string' ? validateId(body.tabId, 'tab id') : task.tab_id
      if (!tabId) {
        const firstTab = (await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string } | null
        tabId = firstTab?.id ?? ''
      }
      const tabExists = (await env.DB.prepare('SELECT id FROM tabs WHERE id = ? AND user_id = ?').bind(tabId, userId).first()) as { id: string } | null
      const targetTabId = tabExists ? tabId : ((await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string })?.id
      if (!targetTabId) return addCors(jsonResponse({ error: 'No tab available' }, 400))
      await bumpTaskOrdersForTab(env, userId, targetTabId)
      const order = 0
      await env.DB.prepare(
        'INSERT INTO tasks (id, user_id, tab_id, text, completed, "order", note, deadline) VALUES (?, ?, ?, ?, 0, ?, ?, ?)'
      )
        .bind(taskId, userId, targetTabId, task.text, order, task.note, task.deadline ?? null)
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
      const tasks = await Promise.all(
        (rows.results as { id: string; text: string; note: string | null; tab_name: string | null; deleted_at: string; created_at: string | null }[]).map(
          async (t) => ({
            ...t,
            text: await decrypt(t.text, env),
            note: t.note ? await decrypt(t.note, env) : null,
            tab_name: t.tab_name ? await decrypt(t.tab_name, env) : null,
          })
        )
      )
      return addCors(jsonResponse({ tasks }))
    }

    if (path === '/history/deleted' && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM deleted_tasks WHERE user_id = ?').bind(userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/history/deleted/') && request.method === 'DELETE') {
      const taskId = validateId(path.slice(17), 'task id')
      const task = (await env.DB.prepare('SELECT id FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { id: string } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      await env.DB.prepare('DELETE FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true }))
    }

    if (path.startsWith('/history/deleted/') && request.method === 'POST') {
      const taskId = validateId(path.slice(17), 'task id')
      const body = await readJsonObject(request)
      const task = (await env.DB.prepare('SELECT * FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first()) as { text: string; note: string | null; tab_id: string | null; deadline: string | null } | null
      if (!task) return addCors(jsonResponse({ error: 'Task not found' }, 404))
      let tabId = typeof body.tabId === 'string' ? validateId(body.tabId, 'tab id') : task.tab_id
      if (!tabId) {
        const firstTab = (await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string } | null
        tabId = firstTab?.id ?? ''
      }
      const tabExists = (await env.DB.prepare('SELECT id FROM tabs WHERE id = ? AND user_id = ?').bind(tabId, userId).first()) as { id: string } | null
      const targetTabId = tabExists ? tabId : ((await env.DB.prepare('SELECT id FROM tabs WHERE user_id = ? ORDER BY "order" LIMIT 1').bind(userId).first()) as { id: string })?.id
      if (!targetTabId) return addCors(jsonResponse({ error: 'No tab available' }, 400))
      await bumpTaskOrdersForTab(env, userId, targetTabId)
      const order = 0
      await env.DB.prepare(
        'INSERT INTO tasks (id, user_id, tab_id, text, completed, "order", note, deadline) VALUES (?, ?, ?, ?, 0, ?, ?, ?)'
      )
        .bind(taskId, userId, targetTabId, task.text, order, task.note, task.deadline ?? null)
        .run()
      await env.DB.prepare('DELETE FROM deleted_tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).run()
      return addCors(jsonResponse({ ok: true, tabId: targetTabId }))
    }

    return addCors(jsonResponse({ error: 'Not found' }, 404))
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return addCors(jsonResponse({ error: err.message }, err.status))
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('API error:', msg, err)
    return addCors(jsonResponse({ error: 'Internal server error' }, 500))
  }
}
