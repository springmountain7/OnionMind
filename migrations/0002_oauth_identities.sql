CREATE TABLE IF NOT EXISTS oauth_identities (
  provider VARCHAR(32) NOT NULL,
  provider_account_id VARCHAR(191) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (provider, provider_account_id),
  INDEX oauth_identities_user_idx (user_id),
  CONSTRAINT oauth_identities_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
