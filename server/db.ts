import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || "./learnmate.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'English',
    default_mode TEXT NOT NULL DEFAULT 'Beginner',
    points INTEGER NOT NULL DEFAULT 0,
    words_learned INTEGER NOT NULL DEFAULT 0,
    streak_days INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_active_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_activity_log (
    user_id TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    actions_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, activity_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    badge_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, badge_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_languages_explored (
    user_id TEXT NOT NULL,
    language TEXT NOT NULL,
    first_used_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, language),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS points_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    points INTEGER NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Learning Session',
    language TEXT NOT NULL DEFAULT 'English',
    mode TEXT NOT NULL DEFAULT 'Beginner',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    structured_json TEXT,
    source_type TEXT NOT NULL DEFAULT 'text',
    language TEXT NOT NULL DEFAULT 'English',
    mode TEXT NOT NULL DEFAULT 'Beginner',
    model_used TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    extracted_text TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'English',
    summary TEXT,
    chapters_json TEXT,
    questions_json TEXT,
    short_notes TEXT,
    detailed_notes TEXT,
    mcqs_json TEXT,
    revision_points_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'English',
    question_count INTEGER NOT NULL,
    timer_minutes INTEGER,
    questions_json TEXT NOT NULL,
    source_doc_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    total_marks INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    wrong_count INTEGER NOT NULL,
    unanswered INTEGER NOT NULL,
    percentage REAL NOT NULL,
    answers_json TEXT NOT NULL,
    feedback_json TEXT NOT NULL,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_topics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    collection_id TEXT,
    title TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'English',
    mode TEXT NOT NULL DEFAULT 'Beginner',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS material_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'English',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS download_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    format TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'English',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media_creations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    aspect_ratio TEXT NOT NULL,
    resolution TEXT,
    duration TEXT,
    model_used TEXT NOT NULL,
    interaction_id TEXT,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    caption TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
if (!userColumns.some((col) => col.name === "longest_streak")) {
  db.exec("ALTER TABLE users ADD COLUMN longest_streak INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE users SET longest_streak = streak_days WHERE longest_streak < streak_days");
}

db.exec(`
  INSERT OR IGNORE INTO daily_activity_log (user_id, activity_date, actions_count)
  SELECT id, last_active_date, 1
  FROM users
  WHERE last_active_date IS NOT NULL
    AND length(last_active_date) = 10
`);

