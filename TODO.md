# TODO
- log in
- multiple tabs that i can name
- history of compleated tasks
- move tasks around
- mobile view
- for every task optional button to add note to the task that can be see from dropdown and it follows points formatting like iin google docs

# PrivateTodo – Complete Functional Specification

A detailed, technology-agnostic specification of all functionality, behavior, and formatting. Use as a task list to rebuild this project.

---

## 1. Authentication & Entry

- **1.1** Login screen: user enters a name (text input) and submits to access the app
- **1.2** Password; identity is based on the name only
- **1.3** All data is stored locally and tied to the logged-in user
- **1.4** Logout: user can log out and return to the login screen
- **1.5** After login, user is taken to the main app; after logout, to the login screen

---

## 2. Tabs (Task Categories)

- **2.1** Multiple tabs to organize tasks; each tab has a name
- **2.2** Default tab: "My Tasks" exists on first use
- **2.3** Add tab: "+ New tab" opens an input; user enters a name and confirms (Add) or cancels
- **2.4** Rename tab: double-click tab name to edit; Enter to save, Escape to cancel
- **2.5** Delete tab: non-default tabs have a delete control (e.g. ×); confirm before deleting
- **2.6** When a tab is deleted, its tasks move to another tab (e.g. first remaining tab)
- **2.7** Tabs are horizontally scrollable when there are many
- **2.8** Active tab is visually highlighted

---

## 3. Tasks – Main List

- **3.1** Add task: input field + Add button; submit creates a task in the active tab
- **3.2** Empty input: Add button disabled or does nothing
- **3.3** Each task shows: drag handle, checkbox, text, note button, delete button
- **3.4** Checkbox: click to mark complete or incomplete
- **3.5** Completed tasks: text shown with strikethrough
- **3.6** Delete: click × to remove task (moves to Deleted history)
- **3.7** Reorder: drag tasks by handle to change order within the same tab
- **3.8** Empty state: show message like "No tasks yet. Add one above!" when there are no tasks

---

## 4. Notes – Overview

- **4.1** Each task has an optional note (expandable section below the task)
- **4.2** Note button: icon to expand/collapse the note area
- **4.3** Note button is highlighted when the task has a note
- **4.4** Clicking the note button opens the note editor directly (no extra "Add note" step)
- **4.5** Note content is stored with the task and persists

---

## 5. Notes – Content Types

- **5.1** Notes support plain text and bullet lists
- **5.2** Plain text: default; no bullets, no special formatting
- **5.3** Bullet lists: created only when user types `-` followed by space on an empty line
- **5.4** Not all content is bulleted; bullets start only when `-`  is entered on an empty line

---

## 6. Notes – Bullet Hierarchy & Symbols

- **6.1** Four bullet symbols by indent level:
  - Level 0: ● (full circle)
  - Level 1: □ (square)
  - Level 2: △ (triangle)
  - Level 3: ◇ (diamond)
- **6.2** Indent: 2 spaces per level (e.g. level 1 = 2 spaces, level 2 = 4 spaces)
- **6.3** Storage format for bullets: indent spaces + `-`  + text (e.g.   `- subpoint`)

---

## 7. Notes – Keyboard: Enter, Tab, Backspace

- **7.1** Enter: new line at same indent level (bullet stays bullet, plain stays plain)
- **7.2** Tab (on bullet line): increase indent (create sub-point)
- **7.3** Shift+Tab (on bullet line): decrease indent (outdent)
- **7.4** Backspace on empty line:
  - If bullet with indent > 0: outdent one level
  - If bullet with indent 0: convert to plain text
  - If plain and only line: do nothing or remove line
  - If plain and multiple lines: remove current line and focus previous
- **7.5** Backspace at start of line (cursor before first character), with text present:
  - If bullet with indent > 0: outdent one level, keep text
  - If bullet with indent 0: convert to plain text, keep text

---

## 8. Notes – Arrow Key Navigation

- **8.1** Arrow Left at start of line: move cursor to end of previous line
- **8.2** Arrow Right at end of line: move cursor to start of next line
- **8.3** Arrow Up: move to previous line; keep same visual column (account for indent/bullet)
- **8.4** Arrow Down: move to next line; keep same visual column
- **8.5** Visual column: bullet + indent + character offset; when moving between lines, place cursor at equivalent horizontal position (or end of line if shorter)

---

## 9. Notes – Typing & Editing

- **9.1** Normal typing: insert characters at cursor
- **9.2** Backspace in middle of text: delete character before cursor
- **9.3** Delete key: delete character after cursor
- **9.4** Cursor must stay in place when editing (no jumping to start)
- **9.5** Text direction: left-to-right; no RTL issues

---

## 10. Notes – Paste

- **10.1** Single line paste: insert as normal text
- **10.2** Multi-line paste: split into lines; first line appends to current line, rest become new lines
- **10.3** Pasted lines starting with  `-` are parsed as bullets with correct indent

---

## 11. Notes – Placeholder & Display

- **11.1** Placeholder "Add a note..." when note is empty
- **11.2** Placeholder only when note area is empty; hide as soon as user types
- **11.3** Placeholder aligned with cursor position (after bullet/gap for bullet lines, after small gap for plain)
- **11.4** Read-only display: show formatted bullets (● □ △ ◇) with correct indent when viewing (e.g. in History)

---

## 12. History Panel – Layout

- **12.1** History view: separate from main task list, toggled by a History button
- **12.2** Two sub-tabs: "Completed" and "Deleted"
- **12.3** On mobile: Back button to return from History to main view

---

## 13. History – Completed Tab

- **13.1** List all completed tasks (most recent first)
- **13.2** Each item: checkmark icon, strikethrough text, tab badge (source tab name), completion time
- **13.3** Relative time: "Just now", "5m ago", "2h ago", "3d ago", or full date for older
- **13.4** Restore: button to move task back to active list in its original tab
- **13.5** If original tab no longer exists, restore to first available tab
- **13.6** Tasks with notes: note icon; click to expand and show formatted note
- **13.7** Empty state: "No completed tasks yet."

---

## 14. History – Deleted Tab

- **14.1** List all deleted tasks (most recent first)
- **14.2** Each item: × icon, task text (no strikethrough), tab badge, deletion time
- **14.3** Restore: button to move task back to active list in its original tab
- **14.4** If original tab no longer exists, restore to first available tab
- **14.5** Tasks with notes: note icon; click to expand and show formatted note
- **14.6** Empty state: "No deleted tasks yet."

---

## 15. Layout & Responsiveness

- **15.1** Desktop: sidebar with user info, logout, History button; main area with tabs and task list
- **15.2** Mobile: header with app name, History button, logout; tabs and task list below
- **15.3** Sidebar hidden on mobile; equivalent actions in header
- **15.4** Tabs scroll horizontally on small screens
- **15.5** Task list and note area usable on touch devices

---

## 16. Data Persistence

- **16.1** All data stored locally (per user)
- **16.2** Persisted: tabs, tasks (including completed, notes), deleted tasks
- **16.3** Data survives page refresh and browser restart
- **16.4** Each user's data isolated (e.g. by user id/name)

---

## 17. Task Data Model

- **17.1** Task: id, text, completed (boolean), completedAt (timestamp when completed), tabId, order, note (optional)
- **17.2** Deleted task: same as task plus deletedAt timestamp
- **17.3** Tab: id, name, order

---

## 18. Note Storage Format

- **18.1** Plain line: just the text
- **18.2** Bullet line:   `` × indent level + `-`  + text
- **18.3** Example: `point 1\n  - sub 1\n  - sub 2` = plain, then two level-1 bullets

---

## 19. Edge Cases & Validation

- **19.1** Empty task text: do not create task
- **19.2** Empty tab name: do not create or rename
- **19.3** Deleting last tab: prevent or ensure at least one tab remains
- **19.4** Default tab: cannot be deleted (or is protected)
- **19.5** Restore when tab is gone: use first available tab

---

## 20. Visual Feedback

- **20.1** Active tab: distinct highlight (e.g. accent color, underline)
- **20.2** Task with note: note icon highlighted
- **20.3** Dragging: task appears semi-transparent or with shadow
- **20.4** Hover: delete button visible on tasks/tabs where applicable
- **20.5** Focus: clear focus state on inputs and buttons

