import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { IMemoryRepository, IDatabase, Memory } from '@main/core/interfaces';

/**
 * Memory repository for SQLite persistence.
 */
@injectable()
export class MemoryRepository implements IMemoryRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(memory: Memory): Promise<Memory> {
    const stmt = this.database.db.prepare(`
      INSERT INTO memories (
        id, content, content_hash, tags, embedding, source,
        metadata, access_count, created_at, updated_at, last_accessed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.content,
      memory.contentHash,
      JSON.stringify(memory.tags),
      memory.embedding ?? null,
      memory.source ?? null,
      memory.metadata ? JSON.stringify(memory.metadata) : null,
      memory.accessCount,
      memory.createdAt,
      memory.updatedAt,
      memory.lastAccessedAt
    );

    return memory;
  }

  async findById(id: string): Promise<Memory | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM memories WHERE id = ?
    `);

    const row = stmt.get(id) as MemoryRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToMemory(row);
  }

  async findByHash(contentHash: string): Promise<Memory | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM memories WHERE content_hash = ?
    `);

    const row = stmt.get(contentHash) as MemoryRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToMemory(row);
  }

  async findByTags(tags: string[]): Promise<Memory[]> {
    // SQLite doesn't have native array support, so we need to check each tag
    const placeholders = tags.map(() => `tags LIKE ?`).join(' OR ');
    const params = tags.map(tag => `%"${tag}"%`);

    const stmt = this.database.db.prepare(`
      SELECT * FROM memories
      WHERE ${placeholders}
      ORDER BY last_accessed_at DESC
    `);

    const rows = stmt.all(...params) as MemoryRow[];
    return rows.map(row => this.mapRowToMemory(row));
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<Memory[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const stmt = this.database.db.prepare(`
      SELECT * FROM memories
      ORDER BY last_accessed_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as MemoryRow[];
    return rows.map(row => this.mapRowToMemory(row));
  }

  async update(memory: Memory): Promise<Memory> {
    const stmt = this.database.db.prepare(`
      UPDATE memories SET
        content = ?,
        content_hash = ?,
        tags = ?,
        embedding = ?,
        source = ?,
        metadata = ?,
        access_count = ?,
        updated_at = ?,
        last_accessed_at = ?
      WHERE id = ?
    `);

    stmt.run(
      memory.content,
      memory.contentHash,
      JSON.stringify(memory.tags),
      memory.embedding ?? null,
      memory.source ?? null,
      memory.metadata ? JSON.stringify(memory.metadata) : null,
      memory.accessCount,
      memory.updatedAt,
      memory.lastAccessedAt,
      memory.id
    );

    return memory;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      DELETE FROM memories WHERE id = ?
    `);

    stmt.run(id);
  }

  async incrementAccessCount(id: string): Promise<Memory> {
    const now = Date.now();

    const stmt = this.database.db.prepare(`
      UPDATE memories SET
        access_count = access_count + 1,
        last_accessed_at = ?
      WHERE id = ?
    `);

    stmt.run(now, id);

    const memory = await this.findById(id);
    if (!memory) {
      throw new Error(`Memory not found: ${id}`);
    }

    return memory;
  }

  /**
   * Map database row to Memory object.
   */
  private mapRowToMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      content: row.content,
      contentHash: row.content_hash,
      tags: JSON.parse(row.tags),
      embedding: row.embedding ?? undefined,
      source: row.source ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      accessCount: row.access_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at,
    };
  }
}

/**
 * Database row type for memories table.
 */
interface MemoryRow {
  id: string;
  content: string;
  content_hash: string;
  tags: string;
  embedding: Buffer | null;
  source: string | null;
  metadata: string | null;
  access_count: number;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
}
