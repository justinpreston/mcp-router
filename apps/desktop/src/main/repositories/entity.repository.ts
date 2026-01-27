import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type { IDatabase, ILogger } from '@main/core/interfaces';
import type {
  Entity,
  EntityType,
  EntityRelation,
  RelationType,
  EntityQueryOptions,
} from '@main/core/advanced-memory.types';

/**
 * Repository interface for Entity and EntityRelation persistence.
 */
export interface IEntityRepository {
  // Entity operations
  createEntity(entity: Omit<Entity, 'id'>): Promise<Entity>;
  findEntityById(id: string): Promise<Entity | null>;
  findEntityByNameAndType(name: string, type: EntityType): Promise<Entity | null>;
  queryEntities(options: EntityQueryOptions): Promise<Entity[]>;
  updateEntity(entity: Entity): Promise<Entity>;
  deleteEntity(id: string): Promise<void>;
  incrementMentionCount(entityId: string, memoryId: string): Promise<Entity>;

  // Relation operations
  createRelation(relation: Omit<EntityRelation, 'id'>): Promise<EntityRelation>;
  findRelationById(id: string): Promise<EntityRelation | null>;
  findRelationsByEntity(entityId: string, direction?: 'source' | 'target' | 'both'): Promise<EntityRelation[]>;
  findRelationBetween(sourceId: string, targetId: string, relationType?: RelationType): Promise<EntityRelation | null>;
  updateRelation(relation: EntityRelation): Promise<EntityRelation>;
  deleteRelation(id: string): Promise<void>;
  reinforceRelation(relationId: string, memoryId: string): Promise<EntityRelation>;

  // Graph traversal
  findPath(fromEntityId: string, toEntityId: string, maxHops?: number): Promise<EntityRelation[]>;
  getEntityGraph(entityId: string, maxHops?: number): Promise<{ entities: Entity[]; relations: EntityRelation[] }>;
}

interface EntityRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  aliases: string;
  mentioned_in_memory_ids: string;
  mention_count: number;
  first_seen_at: number;
  last_seen_at: number;
  importance: number;
  embedding: Buffer | null;
  attributes: string;
  created_at: number;
}

interface RelationRow {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  description: string | null;
  strength: number;
  source_memory_ids: string;
  created_at: number;
  last_reinforced_at: number;
}

/**
 * SQLite repository for Entity and EntityRelation persistence.
 * Implements GraphRAG knowledge graph pattern.
 */
@injectable()
export class EntityRepository implements IEntityRepository {
  constructor(
    @inject(TYPES.Database) private database: IDatabase,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  // ============================================================================
  // Entity Operations
  // ============================================================================

  async createEntity(input: Omit<Entity, 'id'>): Promise<Entity> {
    const id = `entity-${nanoid(12)}`;
    const now = Date.now();

    const stmt = this.database.db.prepare(`
      INSERT INTO entities (
        id, name, type, description, aliases, mentioned_in_memory_ids,
        mention_count, first_seen_at, last_seen_at, importance, embedding,
        attributes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.type,
      input.description ?? null,
      JSON.stringify(input.aliases),
      JSON.stringify(input.mentionedInMemoryIds),
      input.mentionCount,
      input.firstSeenAt,
      input.lastSeenAt,
      input.importance,
      input.embedding ? Buffer.from(new Float32Array(input.embedding).buffer) : null,
      JSON.stringify(input.attributes),
      now
    );

    this.logger.debug('Entity created', { id, name: input.name, type: input.type });

    return this.findEntityById(id) as Promise<Entity>;
  }

  async findEntityById(id: string): Promise<Entity | null> {
    const stmt = this.database.db.prepare('SELECT * FROM entities WHERE id = ?');
    const row = stmt.get(id) as EntityRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToEntity(row);
  }

  async findEntityByNameAndType(name: string, type: EntityType): Promise<Entity | null> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM entities WHERE LOWER(name) = LOWER(?) AND type = ?'
    );
    const row = stmt.get(name, type) as EntityRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToEntity(row);
  }

  async queryEntities(options: EntityQueryOptions): Promise<Entity[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.types && options.types.length > 0) {
      const placeholders = options.types.map(() => '?').join(', ');
      conditions.push(`type IN (${placeholders})`);
      params.push(...options.types);
    }

    if (options.minImportance !== undefined) {
      conditions.push('importance >= ?');
      params.push(options.minImportance);
    }

    let sql = 'SELECT * FROM entities';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY importance DESC, mention_count DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.database.db.prepare(sql);
    const rows = stmt.all(...params) as EntityRow[];

    return rows.map((row) => this.rowToEntity(row));
  }

  async updateEntity(entity: Entity): Promise<Entity> {
    const stmt = this.database.db.prepare(`
      UPDATE entities SET
        name = ?,
        type = ?,
        description = ?,
        aliases = ?,
        mentioned_in_memory_ids = ?,
        mention_count = ?,
        first_seen_at = ?,
        last_seen_at = ?,
        importance = ?,
        embedding = ?,
        attributes = ?
      WHERE id = ?
    `);

    stmt.run(
      entity.name,
      entity.type,
      entity.description ?? null,
      JSON.stringify(entity.aliases),
      JSON.stringify(entity.mentionedInMemoryIds),
      entity.mentionCount,
      entity.firstSeenAt,
      entity.lastSeenAt,
      entity.importance,
      entity.embedding ? Buffer.from(new Float32Array(entity.embedding).buffer) : null,
      JSON.stringify(entity.attributes),
      entity.id
    );

    this.logger.debug('Entity updated', { id: entity.id });

    return this.findEntityById(entity.id) as Promise<Entity>;
  }

  async deleteEntity(id: string): Promise<void> {
    // Relations will be cascade deleted via foreign key
    const stmt = this.database.db.prepare('DELETE FROM entities WHERE id = ?');
    stmt.run(id);

    this.logger.debug('Entity deleted', { id });
  }

  async incrementMentionCount(entityId: string, memoryId: string): Promise<Entity> {
    const entity = await this.findEntityById(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    if (!entity.mentionedInMemoryIds.includes(memoryId)) {
      entity.mentionedInMemoryIds.push(memoryId);
    }
    entity.mentionCount = entity.mentionedInMemoryIds.length;
    entity.lastSeenAt = Date.now();
    
    // Recalculate importance based on mentions
    entity.importance = Math.min(1, 0.3 + (entity.mentionCount * 0.05));

    return this.updateEntity(entity);
  }

  // ============================================================================
  // Relation Operations
  // ============================================================================

  async createRelation(input: Omit<EntityRelation, 'id'>): Promise<EntityRelation> {
    const id = `rel-${nanoid(12)}`;

    const stmt = this.database.db.prepare(`
      INSERT INTO entity_relations (
        id, source_entity_id, target_entity_id, relation_type, description,
        strength, source_memory_ids, created_at, last_reinforced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.sourceEntityId,
      input.targetEntityId,
      input.relationType,
      input.description ?? null,
      input.strength,
      JSON.stringify(input.sourceMemoryIds),
      input.createdAt,
      input.lastReinforcedAt
    );

    this.logger.debug('EntityRelation created', {
      id,
      source: input.sourceEntityId,
      target: input.targetEntityId,
      type: input.relationType,
    });

    return this.findRelationById(id) as Promise<EntityRelation>;
  }

  async findRelationById(id: string): Promise<EntityRelation | null> {
    const stmt = this.database.db.prepare('SELECT * FROM entity_relations WHERE id = ?');
    const row = stmt.get(id) as RelationRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToRelation(row);
  }

  async findRelationsByEntity(
    entityId: string,
    direction: 'source' | 'target' | 'both' = 'both'
  ): Promise<EntityRelation[]> {
    let sql: string;
    let params: string[];

    switch (direction) {
      case 'source':
        sql = 'SELECT * FROM entity_relations WHERE source_entity_id = ?';
        params = [entityId];
        break;
      case 'target':
        sql = 'SELECT * FROM entity_relations WHERE target_entity_id = ?';
        params = [entityId];
        break;
      case 'both':
      default:
        sql = 'SELECT * FROM entity_relations WHERE source_entity_id = ? OR target_entity_id = ?';
        params = [entityId, entityId];
    }

    const stmt = this.database.db.prepare(sql);
    const rows = stmt.all(...params) as RelationRow[];

    return rows.map((row) => this.rowToRelation(row));
  }

  async findRelationBetween(
    sourceId: string,
    targetId: string,
    relationType?: RelationType
  ): Promise<EntityRelation | null> {
    let sql = 'SELECT * FROM entity_relations WHERE source_entity_id = ? AND target_entity_id = ?';
    const params: string[] = [sourceId, targetId];

    if (relationType) {
      sql += ' AND relation_type = ?';
      params.push(relationType);
    }

    const stmt = this.database.db.prepare(sql);
    const row = stmt.get(...params) as RelationRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToRelation(row);
  }

  async updateRelation(relation: EntityRelation): Promise<EntityRelation> {
    const stmt = this.database.db.prepare(`
      UPDATE entity_relations SET
        source_entity_id = ?,
        target_entity_id = ?,
        relation_type = ?,
        description = ?,
        strength = ?,
        source_memory_ids = ?,
        last_reinforced_at = ?
      WHERE id = ?
    `);

    stmt.run(
      relation.sourceEntityId,
      relation.targetEntityId,
      relation.relationType,
      relation.description ?? null,
      relation.strength,
      JSON.stringify(relation.sourceMemoryIds),
      relation.lastReinforcedAt,
      relation.id
    );

    return this.findRelationById(relation.id) as Promise<EntityRelation>;
  }

  async deleteRelation(id: string): Promise<void> {
    const stmt = this.database.db.prepare('DELETE FROM entity_relations WHERE id = ?');
    stmt.run(id);

    this.logger.debug('EntityRelation deleted', { id });
  }

  async reinforceRelation(relationId: string, memoryId: string): Promise<EntityRelation> {
    const relation = await this.findRelationById(relationId);
    if (!relation) {
      throw new Error(`Relation not found: ${relationId}`);
    }

    if (!relation.sourceMemoryIds.includes(memoryId)) {
      relation.sourceMemoryIds.push(memoryId);
    }
    relation.lastReinforcedAt = Date.now();
    // Increase strength with diminishing returns
    relation.strength = Math.min(1, relation.strength + (1 - relation.strength) * 0.1);

    return this.updateRelation(relation);
  }

  // ============================================================================
  // Graph Traversal
  // ============================================================================

  async findPath(
    fromEntityId: string,
    toEntityId: string,
    maxHops: number = 3
  ): Promise<EntityRelation[]> {
    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: Array<{ entityId: string; path: EntityRelation[] }> = [
      { entityId: fromEntityId, path: [] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.entityId === toEntityId) {
        return current.path;
      }

      if (current.path.length >= maxHops || visited.has(current.entityId)) {
        continue;
      }

      visited.add(current.entityId);

      const relations = await this.findRelationsByEntity(current.entityId, 'both');
      for (const relation of relations) {
        const nextEntityId =
          relation.sourceEntityId === current.entityId
            ? relation.targetEntityId
            : relation.sourceEntityId;

        if (!visited.has(nextEntityId)) {
          queue.push({
            entityId: nextEntityId,
            path: [...current.path, relation],
          });
        }
      }
    }

    return []; // No path found
  }

  async getEntityGraph(
    entityId: string,
    maxHops: number = 2
  ): Promise<{ entities: Entity[]; relations: EntityRelation[] }> {
    const entities = new Map<string, Entity>();
    const relations: EntityRelation[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: entityId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) || current.depth > maxHops) {
        continue;
      }

      visited.add(current.id);

      const entity = await this.findEntityById(current.id);
      if (entity) {
        entities.set(entity.id, entity);
      }

      if (current.depth < maxHops) {
        const entityRelations = await this.findRelationsByEntity(current.id, 'both');
        for (const relation of entityRelations) {
          // Avoid duplicate relations
          if (!relations.some((r) => r.id === relation.id)) {
            relations.push(relation);
          }

          const nextId =
            relation.sourceEntityId === current.id
              ? relation.targetEntityId
              : relation.sourceEntityId;

          if (!visited.has(nextId)) {
            queue.push({ id: nextId, depth: current.depth + 1 });
          }
        }
      }
    }

    return {
      entities: Array.from(entities.values()),
      relations,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private rowToEntity(row: EntityRow): Entity {
    return {
      id: row.id,
      name: row.name,
      type: row.type as EntityType,
      description: row.description ?? undefined,
      aliases: JSON.parse(row.aliases),
      mentionedInMemoryIds: JSON.parse(row.mentioned_in_memory_ids),
      mentionCount: row.mention_count,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      importance: row.importance,
      embedding: row.embedding
        ? Array.from(new Float32Array(row.embedding.buffer))
        : undefined,
      attributes: JSON.parse(row.attributes),
    };
  }

  private rowToRelation(row: RelationRow): EntityRelation {
    return {
      id: row.id,
      sourceEntityId: row.source_entity_id,
      targetEntityId: row.target_entity_id,
      relationType: row.relation_type as RelationType,
      description: row.description ?? undefined,
      strength: row.strength,
      sourceMemoryIds: JSON.parse(row.source_memory_ids),
      createdAt: row.created_at,
      lastReinforcedAt: row.last_reinforced_at,
    };
  }
}
