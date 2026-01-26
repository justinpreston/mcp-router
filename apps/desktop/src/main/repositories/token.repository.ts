import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { ITokenRepository, IDatabase, Token } from '@main/core/interfaces';

/**
 * Token repository for SQLite persistence.
 * Stores token metadata (not secrets - those go in keychain).
 */
@injectable()
export class TokenRepository implements ITokenRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {
    this.ensureTable();
  }

  /**
   * Ensure the tokens table exists.
   */
  private ensureTable(): void {
    this.database.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        name TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_used_at INTEGER,
        scopes TEXT NOT NULL,
        server_access TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_tokens_client_id ON tokens(client_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);
    `);
  }

  async create(token: Token): Promise<Token> {
    const stmt = this.database.db.prepare(`
      INSERT INTO tokens (id, client_id, name, issued_at, expires_at, last_used_at, scopes, server_access, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      token.id,
      token.clientId,
      token.name,
      token.issuedAt,
      token.expiresAt,
      token.lastUsedAt ?? null,
      JSON.stringify(token.scopes),
      JSON.stringify(token.serverAccess),
      token.metadata ? JSON.stringify(token.metadata) : null
    );

    return token;
  }

  async findById(id: string): Promise<Token | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM tokens WHERE id = ?
    `);

    const row = stmt.get(id) as TokenRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToToken(row);
  }

  async findByClientId(clientId: string): Promise<Token[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM tokens WHERE client_id = ? ORDER BY created_at DESC
    `);

    const rows = stmt.all(clientId) as TokenRow[];
    return rows.map(row => this.mapRowToToken(row));
  }

  async update(token: Token): Promise<Token> {
    const stmt = this.database.db.prepare(`
      UPDATE tokens SET
        name = ?,
        expires_at = ?,
        last_used_at = ?,
        scopes = ?,
        server_access = ?,
        metadata = ?,
        updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);

    stmt.run(
      token.name,
      token.expiresAt,
      token.lastUsedAt ?? null,
      JSON.stringify(token.scopes),
      JSON.stringify(token.serverAccess),
      token.metadata ? JSON.stringify(token.metadata) : null,
      token.id
    );

    return token;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      DELETE FROM tokens WHERE id = ?
    `);

    stmt.run(id);
  }

  async deleteExpired(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.database.db.prepare(`
      DELETE FROM tokens WHERE expires_at < ?
    `);

    const result = stmt.run(now);
    return result.changes;
  }

  /**
   * Map database row to Token object.
   */
  private mapRowToToken(row: TokenRow): Token {
    return {
      id: row.id,
      clientId: row.client_id,
      name: row.name,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at ?? undefined,
      scopes: JSON.parse(row.scopes),
      serverAccess: JSON.parse(row.server_access),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

/**
 * Database row type for tokens table.
 */
interface TokenRow {
  id: string;
  client_id: string;
  name: string;
  issued_at: number;
  expires_at: number;
  last_used_at: number | null;
  scopes: string;
  server_access: string;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}
