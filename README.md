# PrivateTodo

A private todo app with password login and Cloudflare D1 database storage.

## Features

- **Login with password** – Register or log in with username + password
- **Multiple tabs** – Organize tasks in named tabs (default: "My Tasks")
- **Tasks** – Add, complete, delete, reorder tasks
- **Notes** – Optional notes per task with bullet list support (● □ △ ◇)
- **History** – Completed and deleted tasks with restore
- **Settings** – Customise accent colour (saved to profile)
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

If you have an existing database, run the accent colour migration:

```bash
npm run db:migrate:accent:local   # or db:migrate:accent:remote
```

### 3. Install and run

```bash
npm install
npm run dev
```

This builds the app and runs the Cloudflare Pages dev server. Open http://localhost:8788

## Deploy

### Option A: Deploy via Cloudflare dashboard (GUI)

#### Step 1: Create D1 database

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **D1**
2. Click **Create database**
3. Name it `privatetodo-db` → **Create**
4. Open the database → **Settings** tab
5. Copy the **Database ID** (e.g. `a4b77a06-ec57-41d4-8ec7-7dcf9c0ceb14`)
6. Paste it into `wrangler.toml` in the `database_id` field

#### Step 2: Run database migrations

**Option A – Dashboard:** Open your D1 database → **Console** tab → paste the contents of `schema.sql` → **Execute**.

**Option B – Terminal:** Run `npm run db:migrate:remote` once.

#### Step 3: Create Pages project and connect Git

1. Go to **Workers & Pages** → **Create application** → **Pages**
2. Click **Connect to Git**
3. Choose **GitHub** or **GitLab** and authorize Cloudflare
4. Select your `privatetodo` repository
5. Click **Begin setup**

#### Step 4: Configure build settings

In the build configuration form:

| Field | Value |
|-------|-------|
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | *(leave blank)* |

Leave **Deploy command** blank.

Click **Save and Deploy**.

#### Step 5: Add D1 binding to Pages

1. After the first deploy, open your Pages project
2. Go to **Settings** → **Functions**
3. Scroll to **D1 database bindings**
4. Click **Add binding**
5. **Variable name:** `DB`
6. **D1 database:** Select `privatetodo-db`
7. Click **Save**

#### Step 6: Wire up codepapa.xyz/todo (Worker proxy)

The app is built for `codepapa.xyz/todo`. To serve it under your domain:

1. Note your Pages URL (e.g. `https://todo-abc123.pages.dev`) from the project’s **Deployments** tab
2. Go to **Workers & Pages** → open your **codepapa.xyz** Worker
3. Click **Edit code** (or **Quick edit**)
4. In the `fetch` handler, add this **before** your portfolio logic:

```js
const url = new URL(request.url)
if (url.pathname === '/todo' || url.pathname.startsWith('/todo/')) {
  const pagesUrl = 'https://YOUR-PAGES-URL.pages.dev' + url.pathname
  return fetch(pagesUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })
}
```

5. Replace `YOUR-PAGES-URL` with your actual Pages subdomain (e.g. `todo-abc123`)
6. Click **Save and deploy**

The app will be available at **https://codepapa.xyz/todo**.

---

### Option B: Deploy via CLI

```bash
npm run pages:deploy
```

Then add the D1 binding in the dashboard (Settings → Functions → D1 database bindings) and update your Worker as in Step 6 above.

## API

- `POST /api/auth/register` – Register (username, password)
- `POST /api/auth/login` – Login (username, password)
- `POST /api/auth/logout` – Logout
- `GET /api/auth/me` – Current user
- `PUT /api/auth/settings` – Update settings (accent_color)
- `GET/POST /api/tabs` – List/create tabs
- `PUT/DELETE /api/tabs/:id` – Rename/delete tab
- `GET/POST /api/tasks?tabId=` – List/create tasks
- `PUT/DELETE /api/tasks/:id` – Update/delete task
- `PUT /api/tasks/reorder` – Reorder tasks
- `GET /api/history/completed` – Completed tasks
- `GET /api/history/deleted` – Deleted tasks
- `POST /api/history/completed/:id` – Restore completed
- `POST /api/history/deleted/:id` – Restore deleted
