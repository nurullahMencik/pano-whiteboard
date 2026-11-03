import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

export interface Persistence {
  load(key: string): Uint8Array | null
  save(key: string, state: Uint8Array): void
  count(): number
  close(): void
}

/**
 * One row per room holding the merged Yjs state (`Y.encodeStateAsUpdate`).
 * Writing the full merged state (instead of appending updates) keeps the table
 * compact and makes loading a single `applyUpdate`.
 *
 * Note: on Render's free plan the filesystem is ephemeral. Clients keep a full
 * copy in IndexedDB, so the next editor that connects re-seeds the room.
 */
export class SqlitePersistence implements Persistence {
  private readonly db: DatabaseSync
  private readonly selectStmt: StatementSync
  private readonly upsertStmt: StatementSync
  private readonly countStmt: StatementSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS rooms (
        key TEXT PRIMARY KEY,
        state BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    this.selectStmt = this.db.prepare('SELECT state FROM rooms WHERE key = ?')
    this.upsertStmt = this.db.prepare(
      `INSERT INTO rooms (key, state, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
    )
    this.countStmt = this.db.prepare('SELECT COUNT(*) AS n FROM rooms')
  }

  load(key: string): Uint8Array | null {
    const row = this.selectStmt.get(key) as { state: Uint8Array } | undefined
    return row ? new Uint8Array(row.state) : null
  }

  save(key: string, state: Uint8Array): void {
    this.upsertStmt.run(key, state, Date.now())
  }

  count(): number {
    const row = this.countStmt.get() as { n: number }
    return row.n
  }

  close(): void {
    this.db.close()
  }
}
