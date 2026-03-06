-- Add accent_color to users (for existing databases)
ALTER TABLE users ADD COLUMN accent_color TEXT DEFAULT '#7c5cff';
