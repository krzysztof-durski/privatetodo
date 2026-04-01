# PrivateTodo

PrivateTodo is a Cloudflare Pages + D1 todo app with email auth, encrypted task content, tab-based organization, history/restore, and profile settings.

## Current Feature Set

### User-facing (currently accessible in UI)
- Email auth: register, email verification code, login, logout
- Password reset flow: request code by email, reset with code
- Tabs: create, rename, drag reorder, delete (cannot delete last tab)
- Tasks: create, edit, complete, delete, drag reorder
- Task details: notes, optional deadline/date-time
- History: completed/deleted archives, restore, permanent delete
- Settings: accent color customization, confetti toggle, account deletion confirmation by email code
- Legal pages: Terms of Use, Privacy Policy, License
- Always-visible footer copyright notice

### Implemented but intentionally hidden from navigation
- Daily Tasks module (recurring checklist + stats + past-day editing) is implemented in backend and frontend code, but currently not linked in the sidebar.

## Security and Validation

- Password policy (register/reset): minimum 8 chars with uppercase, lowercase, number, and special character
- Runtime request validation for API bodies and IDs
- Auth/session cookie: HttpOnly + SameSite=Strict + 30-day max age
- Input normalization for email addresses
- Graceful 400 responses for malformed JSON and validation errors

### Rate Limits
Implemented in D1 (`rate_limits`) with `429` + `Retry-After`:
- Register: 5/hour/IP, 3/hour/email
- Verify email: 10/15min/IP
- Login: 10/15min/IP, 8/15min/email
- Forgot password: 5/hour/IP, 3/hour/email
- Reset password: 10/hour/IP, 6/hour/email
- Task create: 5/second/user

## Data Model and Storage

- Database: Cloudflare D1 (`DB` binding)
- Encrypted at rest (when `ENCRYPTION_KEY` is configured):
  - tab names
  - task text
  - notes
  - history text/note/tab name
- If `ENCRYPTION_KEY` is not set/invalid, encryption is bypassed and those fields are stored as plaintext.

## Setup (Local)

### 1) Install
```bash
npm install
```

### 2) Create D1 database (first-time only)
```bash
npm run db:create
```
Copy the returned `database_id` into `wrangler.toml`.

### 3) Apply schema
```bash
npm run db:migrate:local
```

### 4) Configure local env
Create `.dev.vars` manually (there is no `.dev.vars.example` in this repo):

```bash
touch .dev.vars
```

Recommended values:
```bash
# required for encryption at rest
ENCRYPTION_KEY=<base64-32-byte-key-or-64-char-hex>

# required for register/verify/reset/delete-account emails
RESEND_API_KEY=<your_resend_api_key>
RESEND_FROM=Codepapa TODO <noreply@yourdomain.com>
```

Generate an encryption key:
```bash
openssl rand -base64 32
```

### 5) Run app
```bash
npm run dev
```
Open `http://localhost:8788`.

## Deployment (Cloudflare Pages)

1. Build/deploy:
   ```bash
   npm run pages:deploy
   ```
2. In Pages project settings:
   - Add D1 binding: `DB`
   - Add secrets: `ENCRYPTION_KEY`, `RESEND_API_KEY`
   - Optional var/secret: `RESEND_FROM`
3. If serving under a subpath/domain proxy, keep `/todo` path forwarding in your edge Worker.

## Migrations

`schema.sql` is a full snapshot. Incremental migrations are available for existing databases:

- `0001_add_accent_color.sql`
- `0002_password_reset_tokens.sql`
- `0003_email_auth.sql`
- `0004_account_delete_code.sql`
- `0005_defer_account_creation.sql`
- `0006_task_deadline.sql`
- `0007_rate_limits.sql`
- `0008_daily_tasks.sql`

### Useful migration scripts
- Full schema:
  - `npm run db:migrate:local`
  - `npm run db:migrate:remote`
- Targeted:
  - `npm run db:migrate:email:local|remote`
  - `npm run db:migrate:deadline:local|remote`
  - `npm run db:migrate:rate-limit:local|remote`
  - `npm run db:migrate:daily:local|remote`

## API Endpoints

Base path from frontend: `/todo/api`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/auth/settings`
- `POST /api/auth/delete-account-request`
- `POST /api/auth/delete-account`

### Tabs
- `GET /api/tabs`
- `POST /api/tabs`
- `PUT /api/tabs/reorder`
- `PUT /api/tabs/:id`
- `DELETE /api/tabs/:id`

### Tasks
- `GET /api/tasks?tabId=<tabId>`
- `POST /api/tasks`
- `PUT /api/tasks/reorder`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

### History
- `GET /api/history/completed`
- `POST /api/history/completed/:id`
- `POST /api/history/completed/:id/to-deleted`
- `GET /api/history/deleted`
- `DELETE /api/history/deleted`
- `DELETE /api/history/deleted/:id`
- `POST /api/history/deleted/:id`

### Daily (implemented, currently hidden from sidebar UI)
- `GET /api/daily?day=YYYY-MM-DD`
- `POST /api/daily`
- `POST /api/daily/:id/complete`
- `DELETE /api/daily/:id`
- `GET /api/daily/stats?days=<n>&today=YYYY-MM-DD&startDay=YYYY-MM-DD`

## Legal

The app includes:
- Terms of Use (`/todo/terms`)
- Privacy Policy (`/todo/privacy`)
- License (`/todo/license`)

Copyright:
- `© 2026 Krzysztof Durski`
- contact: `contact@durski.dev`

## Troubleshooting

- **Login/register suddenly failing with server error**
  - Ensure DB schema includes `verification_codes` and `rate_limits`
  - Run:
    ```bash
    npm run db:migrate:email:remote
    npm run db:migrate:rate-limit:remote
    ```
- **Daily endpoints failing**
  - Apply:
    ```bash
    npm run db:migrate:daily:remote
    ```
- **No emails sent**
  - Confirm `RESEND_API_KEY` exists in Pages secrets
  - Optionally set valid `RESEND_FROM` sender for your verified domain
- **Need runtime logs**
  - Run:
    ```bash
    npx wrangler pages deployment tail
    ```
