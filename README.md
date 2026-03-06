# PrivateTodo

A private todo app with password login and Cloudflare D1 database storage.

## Features

- **Login with password** – Register or log in with username + password
- **Multiple tabs** – Organize tasks in named tabs (default: "My Tasks")
- **Tasks** – Add, complete, delete, reorder tasks
- **Notes** – Optional notes per task with bullet list support (● □ △ ◇)
- **History** – Completed and deleted tasks with restore
- **Mobile view** – Responsive layout with sidebar toggle

## Setup

### 1. Create D1 database

```bash
npm run db:create
```

Copy the `database_id` from the output and paste it into `wrangler.toml` (replace `REPLACE_WITH_YOUR_DATABASE_ID`).

### 2. Run migrations

```bash
# Local (for dev)
npm run db:migrate:local

# Remote (for production)
npm run db:migrate:remote
```

### 3. Install and run

```bash
npm install
npm run dev
```

This builds the app and runs the Cloudflare Pages dev server. Open http://localhost:8788

## Deploy

```bash
npm run pages:deploy
```

Then connect your Cloudflare Pages project to the repo or upload the `dist` folder. Ensure the D1 database binding is configured in the Cloudflare dashboard (Settings → Bindings → D1 database).

## API

- `POST /api/auth/register` – Register (username, password)
- `POST /api/auth/login` – Login (username, password)
- `POST /api/auth/logout` – Logout
- `GET /api/auth/me` – Current user
- `GET/POST /api/tabs` – List/create tabs
- `PUT/DELETE /api/tabs/:id` – Rename/delete tab
- `GET/POST /api/tasks?tabId=` – List/create tasks
- `PUT/DELETE /api/tasks/:id` – Update/delete task
- `PUT /api/tasks/reorder` – Reorder tasks
- `GET /api/history/completed` – Completed tasks
- `GET /api/history/deleted` – Deleted tasks
- `POST /api/history/completed/:id` – Restore completed
- `POST /api/history/deleted/:id` – Restore deleted
