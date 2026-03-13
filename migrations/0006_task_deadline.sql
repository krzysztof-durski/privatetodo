-- Add optional deadline to tasks (YYYY-MM-DD, nullable).
-- Also add to completed_tasks and deleted_tasks for history/restore.

ALTER TABLE tasks ADD COLUMN deadline TEXT;
ALTER TABLE completed_tasks ADD COLUMN deadline TEXT;
ALTER TABLE deleted_tasks ADD COLUMN deadline TEXT;
