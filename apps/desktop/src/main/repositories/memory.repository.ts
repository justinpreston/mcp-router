import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { 
  IMemoryRepository, 
  IDatabase, 
  Memory, 
  MemoryType,
  PaginationOptions,
  PaginatedResponse
} from '@main/core/interfaces';

/**
 * Memory repository for SQLite persistence.
 */
@injectable()
export class MemoryRepository implements IMemoryRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(memory: Memory): Promise<Memory> {
    const stmt = this.database.db.prepare(`
      INSERT INTO memories (
        id, content, content_hash, type, importance, tags, embedding, source,
        metadata, access_count, created_at, updated_at, last_accessed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.content,
      memory.contentHash,
      memory.type,
      memory.importance,
      JSON.stringify(memory.tags),
      memory.embedding ? JSON.stringify(memory.embedding) : null,
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

  /**
   * Cursor-based pagination for efficient large dataset access.
   * Uses created_at timestamp as the cursor.
   */
  async findPaginated(options?: PaginationOptions): Promise<PaginatedResponse<Memory>> {
    const limit = options?.limit ?? 50;
    const orderDir = options?.orderDir ?? 'desc';
    
    // Parse cursor (timestamp-based)
    const cursor = options?.cursor ? parseInt(options.cursor, 10) : undefined;
    
    // Build query based on cursor and direction
    let sql: string;
    const params: (number | string)[] = [];
    
    if (cursor) {
      if (orderDir === 'desc') {
        sql = `
          SELECT * FROM memories
          WHERE created_at < ?
          ORDER BY created_at DESC
          LIMIT ?
        `;
        params.push(cursor, limit + 1);
      } else {
        sql = `
          SELECT * FROM memories
          WHERE created_at > ?
          ORDER BY created_at ASC
          LIMIT ?
        `;
        params.push(cursor, limit + 1);
      }
    } else {
      sql = `
        SELECT * FROM memories
        ORDER BY created_at ${orderDir === 'desc' ? 'DESC' : 'ASC'}
        LIMIT ?
      `;
      params.push(limit + 1);
    }
    
    const stmt = this.database.db.prepare(sql);
    const rows = stmt.all(...params) as MemoryRow[];
    
    // Check if there are more items
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows.pop(); // Remove the extra item we fetched to check for more
    }
    
    const items = rows.map(row => this.mapRowToMemory(row));
    
    // Generate next cursor from last item
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? lastItem.createdAt.toString()
      : undefined;
    
    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Count total memories.
   */
  async count(): Promise<number> {
    const stmt = this.database.db.prepare('SELECT COUNT(*) as count FROM memories');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async update(memory: Memory): Promise<Memory> {
    const stmt = this.database.db.prepare(`
      UPDATE memories SET
        content = ?,
        content_hash = ?,
        type = ?,
        importance = ?,
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
      memory.type,
      memory.importance,
      JSON.stringify(memory.tags),
      memory.embedding ? JSON.stringify(memory.embedding) : null,
      memory.source ?? null,
      memory.metadata ? JSON.stringify(memory.metadata) : null,
      memory.accessCount,
      memory.updatedAt,
      memory.lastAccessedAt,
      memory.id
    );

    return memory;
  }

  async findByTypes(types: MemoryType[]): Promise<Memory[]> {
    if (types.length === 0) {
      return [];
    }

    const placeholders = types.map(() => '?').join(', ');
    const stmt = this.database.db.prepare(`
      SELECT * FROM memories
      WHERE type IN (${placeholders})
      ORDER BY last_accessed_at DESC
    `);

    const rows = stmt.all(...types) as MemoryRow[];
    return rows.map(row => this.mapRowToMemory(row));
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

  async bulkAddTag(ids: string[], tag: string): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    let updated = 0;
    const now = Date.now();

    // Process in a transaction for atomicity
    const transaction = this.database.db.transaction(() => {
      for (const id of ids) {
        const memory = this.database.db
          .prepare('SELECT tags FROM memories WHERE id = ?')
          .get(id) as { tags: string } | undefined;

        if (memory) {
          const tags: string[] = JSON.parse(memory.tags);
          if (!tags.includes(tag)) {
            tags.push(tag);
            this.database.db
              .prepare('UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?')
              .run(JSON.stringify(tags), now, id);
            updated++;
          }
        }
      }
    });

    transaction();
    return updated;
  }

  async bulkRemoveTag(ids: string[], tag: string): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    let updated = 0;
    const now = Date.now();

    const transaction = this.database.db.transaction(() => {
      for (const id of ids) {
        const memory = this.database.db
          .prepare('SELECT tags FROM memories WHERE id = ?')
          .get(id) as { tags: string } | undefined;

        if (memory) {
          const tags: string[] = JSON.parse(memory.tags);
          const index = tags.indexOf(tag);
          if (index > -1) {
            tags.splice(index, 1);
            this.database.db
              .prepare('UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?')
              .run(JSON.stringify(tags), now, id);
            updated++;
          }
        }
      }
    });

    transaction();
    return updated;
  }

  async renameTag(oldTag: string, newTag: string): Promise<number> {
    let updated = 0;
    const now = Date.now();

    // Find all memories with the old tag
    const memories = this.database.db
      .prepare('SELECT id, tags FROM memories WHERE tags LIKE ?')
      .all(`%"${oldTag}"%`) as { id: string; tags: string }[];

    const transaction = this.database.db.transaction(() => {
      for (const memory of memories) {
        const tags: string[] = JSON.parse(memory.tags);
        const index = tags.indexOf(oldTag);
        if (index > -1) {
          tags[index] = newTag;
          this.database.db
            .prepare('UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(tags), now, memory.id);
          updated++;
        }
      }
    });

    transaction();
    return updated;
  }

  async deleteTag(tag: string): Promise<number> {
    let updated = 0;
    const now = Date.now();

    // Find all memories with the tag
    const memories = this.database.db
      .prepare('SELECT id, tags FROM memories WHERE tags LIKE ?')
      .all(`%"${tag}"%`) as { id: string; tags: string }[];

    const transaction = this.database.db.transaction(() => {
      for (const memory of memories) {
        const tags: string[] = JSON.parse(memory.tags);
        const index = tags.indexOf(tag);
        if (index > -1) {
          tags.splice(index, 1);
          this.database.db
            .prepare('UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(tags), now, memory.id);
          updated++;
        }
      }
    });

    transaction();
    return updated;
  }

  async getAllTags(): Promise<{ tag: string; count: number }[]> {
    // Get all memories and extract tags
    const memories = this.database.db
      .prepare('SELECT tags FROM memories')
      .all() as { tags: string }[];

    const tagCounts = new Map<string, number>();

    for (const memory of memories) {
      const tags: string[] = JSON.parse(memory.tags);
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    // Convert to array and sort by count descending
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Map database row to Memory object.
   */
  private mapRowToMemory(row: MemoryRow): Memory {
    // Convert embedding Buffer to number array
    let embedding: number[] | undefined;
    if (row.embedding) {
      try {
        // Embedding stored as JSON string in SQLite
        embedding = JSON.parse(row.embedding.toString());
      } catch {
        // Legacy format or invalid - skip
        embedding = undefined;
      }
    }

    return {
      id: row.id,
      content: row.content,
      contentHash: row.content_hash,
      type: row.type as MemoryType,
      importance: row.importance,
      tags: JSON.parse(row.tags),
      embedding,
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
  type: string;
  importance: number;
  tags: string;
  embedding: Buffer | null;
  source: string | null;
  metadata: string | null;
  access_count: number;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
}
