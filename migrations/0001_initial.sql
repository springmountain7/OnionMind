CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  zhihu_subject VARCHAR(191) NOT NULL UNIQUE,
  display_name VARCHAR(191) NULL,
  avatar_url VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  user_id CHAR(36) PRIMARY KEY,
  access_token_cipher TEXT NOT NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT oauth_accounts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX sessions_user_idx (user_id),
  INDEX sessions_expires_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_attempts (
  state_hash CHAR(64) PRIMARY KEY,
  nonce_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX oauth_attempts_expires_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notes (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(200) NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX notes_user_updated_idx (user_id, updated_at),
  CONSTRAINT notes_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS note_images (
  id CHAR(36) PRIMARY KEY,
  note_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  image_data LONGBLOB NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  size_bytes INT NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX note_images_note_idx (note_id),
  INDEX note_images_user_idx (user_id),
  CONSTRAINT note_images_note_fk FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  CONSTRAINT note_images_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS zhihu_items (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  source_url VARCHAR(1024) NOT NULL,
  content_type VARCHAR(32) NOT NULL,
  title VARCHAR(500) NOT NULL,
  summary TEXT NOT NULL,
  author_name VARCHAR(191) NULL,
  favorite_at DATETIME NULL,
  synced_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY zhihu_items_user_source_uq (user_id, source_hash),
  INDEX zhihu_items_user_favorite_idx (user_id, favorite_at),
  CONSTRAINT zhihu_items_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS memory_cards (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  source_item_id CHAR(36) NOT NULL,
  data JSON NOT NULL,
  model VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY memory_cards_user_source_uq (user_id, source_item_id),
  CONSTRAINT memory_cards_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT memory_cards_source_fk FOREIGN KEY (source_item_id) REFERENCES zhihu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feedback_reports (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  source_refs JSON NOT NULL,
  data JSON NOT NULL,
  model VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX feedback_reports_user_created_idx (user_id, created_at),
  CONSTRAINT feedback_reports_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS generation_cooldowns (
  user_id CHAR(36) NOT NULL,
  action VARCHAR(32) NOT NULL,
  last_run_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, action),
  CONSTRAINT generation_cooldowns_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_events (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  input_tokens BIGINT UNSIGNED NOT NULL,
  output_tokens BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX usage_events_user_created_idx (user_id, created_at),
  CONSTRAINT usage_events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
