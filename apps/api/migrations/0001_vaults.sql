CREATE TABLE IF NOT EXISTS vaults (
  vault_id TEXT PRIMARY KEY,
  auth_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
