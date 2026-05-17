# Migration Status

SQLite schema version history. Migrations are applied idempotently at startup
via `CREATE TABLE IF NOT EXISTS` — no migration framework needed at this scale.

## Schema v1 (initial, applied on first start)

Tables created:
- `account_state` — per-account polling state (username cache, initial import flag)
- `media` — fetched media items with posting status
- `app_state` — key/value store (access token, token expiry)

Indexes created:
- `idx_media_account_seen` on `media(account_id, seen_at)`

---

*Future schema changes: add a section here before deploying, note the migration SQL and date.*
