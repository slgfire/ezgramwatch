import Database from 'better-sqlite3';

export interface AccountRow {
  account_id: string;
  username: string | null;
  alias: string | null;
  initial_import_done: 0 | 1;
  last_polled_at: string | null;
  updated_at: string;
}

export interface MediaRow {
  id: string;
  account_id: string;
  media_type: string;
  media_product_type: string | null;
  permalink: string | null;
  caption: string | null;
  timestamp: string | null;
  thumbnail_url: string | null;
  media_url: string | null;
  posted_to_discord: 0 | 1;
  seen_at: string;
  posted_at: string | null;
}

export interface MediaInsert {
  id: string;
  account_id: string;
  media_type: string;
  media_product_type?: string | null;
  permalink?: string | null;
  caption?: string | null;
  timestamp?: string | null;
  thumbnail_url?: string | null;
  media_url?: string | null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS account_state (
    account_id           TEXT PRIMARY KEY,
    username             TEXT,
    alias                TEXT,
    initial_import_done  INTEGER NOT NULL DEFAULT 0,
    last_polled_at       TEXT,
    updated_at           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id                   TEXT PRIMARY KEY,
    account_id           TEXT NOT NULL,
    media_type           TEXT NOT NULL,
    media_product_type   TEXT,
    permalink            TEXT,
    caption              TEXT,
    timestamp            TEXT,
    thumbnail_url        TEXT,
    media_url            TEXT,
    posted_to_discord    INTEGER NOT NULL DEFAULT 0,
    seen_at              TEXT NOT NULL,
    posted_at            TEXT,
    FOREIGN KEY (account_id) REFERENCES account_state(account_id)
  );

  CREATE INDEX IF NOT EXISTS idx_media_account_ts ON media(account_id, timestamp);

  CREATE TABLE IF NOT EXISTS app_state (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export function openDb(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);

  const stmts = {
    getState:            db.prepare('SELECT value FROM app_state WHERE key = ?'),
    setState:            db.prepare('INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?, ?, ?)'),
    getAccount:          db.prepare('SELECT * FROM account_state WHERE account_id = ?'),
    upsertAccount:       db.prepare(`
      INSERT INTO account_state (account_id, username, alias, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        username   = excluded.username,
        alias      = excluded.alias,
        updated_at = excluded.updated_at
    `),
    setImportDone:       db.prepare('UPDATE account_state SET initial_import_done = 1, updated_at = ? WHERE account_id = ?'),
    setLastPolledAt:     db.prepare('UPDATE account_state SET last_polled_at = ?, updated_at = ? WHERE account_id = ?'),
    insertMedia:         db.prepare(`
      INSERT OR IGNORE INTO media
        (id, account_id, media_type, media_product_type, permalink, caption,
         timestamp, thumbnail_url, media_url, seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getUnposted:         db.prepare('SELECT * FROM media WHERE account_id = ? AND posted_to_discord = 0 ORDER BY timestamp ASC'),
    markAllPosted:       db.prepare('UPDATE media SET posted_to_discord = 1, posted_at = ? WHERE account_id = ? AND posted_to_discord = 0'),
    limitFirstRunItems:  db.prepare(`
      UPDATE media SET posted_to_discord = 1, posted_at = ?
      WHERE account_id = ? AND posted_to_discord = 0
        AND id NOT IN (
          SELECT id FROM media WHERE account_id = ? AND posted_to_discord = 0
          ORDER BY timestamp DESC LIMIT ?
        )
    `),
    markPosted:          db.prepare('UPDATE media SET posted_to_discord = 1, posted_at = ? WHERE id = ?'),
  };

  const now = () => new Date().toISOString();

  return {
    getState: (key: string): string | undefined =>
      (stmts.getState.get(key) as { value: string } | undefined)?.value,

    setState: (key: string, value: string): void => {
      stmts.setState.run(key, value, now());
    },

    getAccount: (id: string): AccountRow | undefined =>
      stmts.getAccount.get(id) as AccountRow | undefined,

    upsertAccount: (id: string, username: string | null, alias: string | undefined): void => {
      stmts.upsertAccount.run(id, username, alias ?? null, now());
    },

    setInitialImportDone: (id: string): void => {
      stmts.setImportDone.run(now(), id);
    },

    setLastPolledAt: (id: string): void => {
      const t = now();
      stmts.setLastPolledAt.run(t, t, id);
    },

    insertMedia: (item: MediaInsert): boolean => {
      const result = stmts.insertMedia.run(
        item.id, item.account_id, item.media_type, item.media_product_type ?? null,
        item.permalink ?? null, item.caption ?? null, item.timestamp ?? null,
        item.thumbnail_url ?? null, item.media_url ?? null, now(),
      );
      return result.changes > 0;
    },

    getUnposted: (accountId: string): MediaRow[] =>
      stmts.getUnposted.all(accountId) as MediaRow[],

    markAllPosted: (accountId: string): void => {
      stmts.markAllPosted.run(now(), accountId);
    },

    limitFirstRunItems: (accountId: string, keepN: number): void => {
      stmts.limitFirstRunItems.run(now(), accountId, accountId, keepN);
    },

    markPosted: (mediaId: string): void => {
      stmts.markPosted.run(now(), mediaId);
    },

    close: (): void => { db.close(); },
  };
}

export type Db = ReturnType<typeof openDb>;
