CREATE TABLE IF NOT EXISTS repository_search_documents (
  repository_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL DEFAULT '',
  custom_description TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  ai_platforms TEXT NOT NULL DEFAULT '',
  custom_category TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '',
  readme TEXT NOT NULL DEFAULT '',
  stargazers_count INTEGER NOT NULL DEFAULT 0,
  subscribed_to_releases INTEGER NOT NULL DEFAULT 0,
  analyzed_at TEXT,
  analysis_failed INTEGER NOT NULL DEFAULT 0,
  category_locked INTEGER NOT NULL DEFAULT 0,
  last_edited TEXT,
  updated_at TEXT,
  pushed_at TEXT,
  starred_at TEXT,
  indexed_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS repository_search_fts USING fts5(
  repository_id UNINDEXED,
  full_name,
  name,
  topics,
  tags,
  description,
  ai_summary,
  custom_description,
  language,
  ai_platforms,
  custom_category,
  license,
  readme,
  tokenize = 'trigram'
);

CREATE TABLE IF NOT EXISTS repository_search_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
