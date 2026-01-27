import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type { IDatabase, ILogger } from '@main/core/interfaces';
import type { Episode, EpisodeQueryOptions } from '@main/core/advanced-memory.types';

/**
 * Repository interface for Episode persistence.
 */
export interface IEpisodeRepository {
  create(episode: Omit<Episode, 'id'>): Promise<Episode>;
  findById(id: string): Promise<Episode | null>;
  findBySessionId(sessionId: string): Promise<Episode[]>;
  findActive(): Promise<Episode[]>;
  query(options: EpisodeQueryOptions): Promise<Episode[]>;
  update(episode: Episode): Promise<Episode>;
  delete(id: string): Promise<void>;
  addMemoryToEpisode(episodeId: string, memoryId: string): Promise<void>;
  removeMemoryFromEpisode(episodeId: string, memoryId: string): Promise<void>;
}

interface EpisodeRow {
  id: string;
  title: string;
  summary: string | null;
  session_id: string | null;
  memory_ids: string;
  entities: string;
  topics: string;
  sentiment: string | null;
  started_at: number;
  ended_at: number | null;
  is_active: number;
  parent_episode_id: string | null;
  importance: number;
  embedding: Buffer | null;
  created_at: number;
}

/**
 * SQLite repository for Episode persistence.
 * Implements episodic memory pattern from Generative Agents.
 */
@injectable()
export class EpisodeRepository implements IEpisodeRepository {
  constructor(
    @inject(TYPES.Database) private database: IDatabase,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async create(input: Omit<Episode, 'id'>): Promise<Episode> {
    const id = `episode-${nanoid(12)}`;
    const now = Date.now();

    const stmt = this.database.db.prepare(`
      INSERT INTO episodes (
        id, title, summary, session_id, memory_ids, entities, topics,
        sentiment, started_at, ended_at, is_active, parent_episode_id,
        importance, embedding, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.title,
      input.summary ?? null,
      input.sessionId ?? null,
      JSON.stringify(input.memoryIds),
      JSON.stringify(input.entities),
      JSON.stringify(input.topics),
      input.sentiment ?? null,
      input.startedAt,
      input.endedAt ?? null,
      input.isActive ? 1 : 0,
      input.parentEpisodeId ?? null,
      input.importance,
      input.embedding ? Buffer.from(new Float32Array(input.embedding).buffer) : null,
      now
    );

    this.logger.debug('Episode created', { id, title: input.title });

    return this.findById(id) as Promise<Episode>;
  }

  async findById(id: string): Promise<Episode | null> {
    const stmt = this.database.db.prepare('SELECT * FROM episodes WHERE id = ?');
    const row = stmt.get(id) as EpisodeRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToEpisode(row);
  }

  async findBySessionId(sessionId: string): Promise<Episode[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM episodes WHERE session_id = ? ORDER BY started_at DESC'
    );
    const rows = stmt.all(sessionId) as EpisodeRow[];

    return rows.map((row) => this.rowToEpisode(row));
  }

  async findActive(): Promise<Episode[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM episodes WHERE is_active = 1 ORDER BY started_at DESC'
    );
    const rows = stmt.all() as EpisodeRow[];

    return rows.map((row) => this.rowToEpisode(row));
  }

  async query(options: EpisodeQueryOptions): Promise<Episode[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }

    if (options.activeOnly) {
      conditions.push('is_active = 1');
    }

    if (options.startAfter !== undefined) {
      conditions.push('started_at >= ?');
      params.push(options.startAfter);
    }

    if (options.endBefore !== undefined) {
      conditions.push('started_at <= ?');
      params.push(options.endBefore);
    }

    if (options.minImportance !== undefined) {
      conditions.push('importance >= ?');
      params.push(options.minImportance);
    }

    let sql = 'SELECT * FROM episodes';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY started_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.database.db.prepare(sql);
    const rows = stmt.all(...params) as EpisodeRow[];

    return rows.map((row) => this.rowToEpisode(row));
  }

  async update(episode: Episode): Promise<Episode> {
    const stmt = this.database.db.prepare(`
      UPDATE episodes SET
        title = ?,
        summary = ?,
        session_id = ?,
        memory_ids = ?,
        entities = ?,
        topics = ?,
        sentiment = ?,
        started_at = ?,
        ended_at = ?,
        is_active = ?,
        parent_episode_id = ?,
        importance = ?,
        embedding = ?
      WHERE id = ?
    `);

    stmt.run(
      episode.title,
      episode.summary ?? null,
      episode.sessionId ?? null,
      JSON.stringify(episode.memoryIds),
      JSON.stringify(episode.entities),
      JSON.stringify(episode.topics),
      episode.sentiment ?? null,
      episode.startedAt,
      episode.endedAt ?? null,
      episode.isActive ? 1 : 0,
      episode.parentEpisodeId ?? null,
      episode.importance,
      episode.embedding ? Buffer.from(new Float32Array(episode.embedding).buffer) : null,
      episode.id
    );

    this.logger.debug('Episode updated', { id: episode.id });

    return this.findById(episode.id) as Promise<Episode>;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare('DELETE FROM episodes WHERE id = ?');
    stmt.run(id);

    this.logger.debug('Episode deleted', { id });
  }

  async addMemoryToEpisode(episodeId: string, memoryId: string): Promise<void> {
    const episode = await this.findById(episodeId);
    if (!episode) {
      throw new Error(`Episode not found: ${episodeId}`);
    }

    if (!episode.memoryIds.includes(memoryId)) {
      episode.memoryIds.push(memoryId);
      await this.update(episode);
    }
  }

  async removeMemoryFromEpisode(episodeId: string, memoryId: string): Promise<void> {
    const episode = await this.findById(episodeId);
    if (!episode) {
      throw new Error(`Episode not found: ${episodeId}`);
    }

    const index = episode.memoryIds.indexOf(memoryId);
    if (index > -1) {
      episode.memoryIds.splice(index, 1);
      await this.update(episode);
    }
  }

  private rowToEpisode(row: EpisodeRow): Episode {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary ?? undefined,
      sessionId: row.session_id ?? undefined,
      memoryIds: JSON.parse(row.memory_ids),
      entities: JSON.parse(row.entities),
      topics: JSON.parse(row.topics),
      sentiment: row.sentiment as Episode['sentiment'] ?? undefined,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      isActive: row.is_active === 1,
      parentEpisodeId: row.parent_episode_id ?? undefined,
      importance: row.importance,
      embedding: row.embedding
        ? Array.from(new Float32Array(row.embedding.buffer))
        : undefined,
    };
  }
}
