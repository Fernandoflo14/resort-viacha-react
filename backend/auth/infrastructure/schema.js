export const authSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    profile_image TEXT NOT NULL DEFAULT '/assets/logo.png',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;
