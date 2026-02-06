import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type { IDatabase, ILogger } from '@main/core/interfaces';
import type {
  Reflection,
  ReflectionType,
  Contradiction,
  ContradictionType,
  ContradictionStatus,
  MemoryProvenance,
  ProvenanceSource,
} from '@main/core/advanced-memory.types';

/**
 * Repository interface for Reflection, Contradiction, and Provenance persistence.
 */
export interface IReflectionRepository {
  // Reflection operations
  createReflection(reflection: Omit<Reflection, 'id'>): Promise<Reflection>;
  findReflectionById(id: string): Promise<Reflection | null>;
  findReflectionsByType(type: ReflectionType): Promise<Reflection[]>;
  findActiveReflections(): Promise<Reflection[]>;
  updateReflection(reflection: Reflection): Promise<Reflection>;
  deleteReflection(id: string): Promise<void>;
  markContradicted(reflectionId: string, contradictedById: string): Promise<void>;

  // Contradiction operations
  createContradiction(contradiction: Omit<Contradiction, 'id'>): Promise<Contradiction>;
  findContradictionById(id: string): Promise<Contradiction | null>;
  findContradictionsByStatus(status: ContradictionStatus): Promise<Contradiction[]>;
  findContradictionsForItem(itemId: string, itemType: 'memory' | 'reflection'): Promise<Contradiction[]>;
  updateContradiction(contradiction: Contradiction): Promise<Contradiction>;
  resolveContradiction(
    id: string,
    status: ContradictionStatus,
    resolution?: string,
    resolvedInFavorOf?: string
  ): Promise<Contradiction>;
  deleteContradiction(id: string): Promise<void>;

  // Provenance operations
  setProvenance(provenance: MemoryProvenance): Promise<MemoryProvenance>;
  getProvenance(memoryId: string): Promise<MemoryProvenance | null>;
  deleteProvenance(memoryId: string): Promise<void>;
  findBySourceType(sourceType: ProvenanceSource): Promise<MemoryProvenance[]>;
  findVerified(): Promise<MemoryProvenance[]>;
}

interface ReflectionRow {
  id: string;
  content: string;
  type: string;
  source_memory_ids: string;
  confidence: number;
  evidence_count: number;
  open_questions: string | null;
  is_contradicted: number;
  contradicted_by_id: string | null;
  embedding: Buffer | null;
  created_at: number;
  validated_at: number | null;
}

interface ContradictionRow {
  id: string;
  item_a_id: string;
  item_a_type: string;
  item_b_id: string;
  item_b_type: string;
  description: string;
  type: string;
  severity: number;
  status: string;
  resolution: string | null;
  resolved_in_favor_of: string | null;
  detected_at: number;
  resolved_at: number | null;
}

interface ProvenanceRow {
  memory_id: string;
  source_type: string;
  source_id: string | null;
  source_name: string | null;
  trust_score: number;
  verified: number;
  verification_method: string | null;
  verified_by: string | null;
  recorded_at: number;
}

/**
 * SQLite repository for Reflection, Contradiction, and Provenance persistence.
 * Implements Generative Agents reflection pattern and BDI contradiction detection.
 */
@injectable()
export class ReflectionRepository implements IReflectionRepository {
  constructor(
    @inject(TYPES.Database) private database: IDatabase,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  // ============================================================================
  // Reflection Operations
  // ============================================================================

  async createReflection(input: Omit<Reflection, 'id'>): Promise<Reflection> {
    const id = `refl-${nanoid(12)}`;
    const now = Date.now();

    const stmt = this.database.db.prepare(`
      INSERT INTO reflections (
        id, content, type, source_memory_ids, confidence, evidence_count,
        open_questions, is_contradicted, contradicted_by_id, embedding,
        created_at, validated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.content,
      input.type,
      JSON.stringify(input.sourceMemoryIds),
      input.confidence,
      input.evidenceCount,
      input.openQuestions ? JSON.stringify(input.openQuestions) : null,
      input.isContradicted ? 1 : 0,
      input.contradictedById ?? null,
      input.embedding ? Buffer.from(new Float32Array(input.embedding).buffer) : null,
      now,
      input.validatedAt ?? null
    );

    this.logger.debug('Reflection created', { id, type: input.type });

    return this.findReflectionById(id) as Promise<Reflection>;
  }

  async findReflectionById(id: string): Promise<Reflection | null> {
    const stmt = this.database.db.prepare('SELECT * FROM reflections WHERE id = ?');
    const row = stmt.get(id) as ReflectionRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToReflection(row);
  }

  async findReflectionsByType(type: ReflectionType): Promise<Reflection[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM reflections WHERE type = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(type) as ReflectionRow[];

    return rows.map((row) => this.rowToReflection(row));
  }

  async findActiveReflections(): Promise<Reflection[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM reflections WHERE is_contradicted = 0 ORDER BY confidence DESC, created_at DESC'
    );
    const rows = stmt.all() as ReflectionRow[];

    return rows.map((row) => this.rowToReflection(row));
  }

  async updateReflection(reflection: Reflection): Promise<Reflection> {
    const stmt = this.database.db.prepare(`
      UPDATE reflections SET
        content = ?,
        type = ?,
        source_memory_ids = ?,
        confidence = ?,
        evidence_count = ?,
        open_questions = ?,
        is_contradicted = ?,
        contradicted_by_id = ?,
        embedding = ?,
        validated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      reflection.content,
      reflection.type,
      JSON.stringify(reflection.sourceMemoryIds),
      reflection.confidence,
      reflection.evidenceCount,
      reflection.openQuestions ? JSON.stringify(reflection.openQuestions) : null,
      reflection.isContradicted ? 1 : 0,
      reflection.contradictedById ?? null,
      reflection.embedding ? Buffer.from(new Float32Array(reflection.embedding).buffer) : null,
      reflection.validatedAt ?? null,
      reflection.id
    );

    return this.findReflectionById(reflection.id) as Promise<Reflection>;
  }

  async deleteReflection(id: string): Promise<void> {
    const stmt = this.database.db.prepare('DELETE FROM reflections WHERE id = ?');
    stmt.run(id);

    this.logger.debug('Reflection deleted', { id });
  }

  async markContradicted(reflectionId: string, contradictedById: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      UPDATE reflections SET is_contradicted = 1, contradicted_by_id = ? WHERE id = ?
    `);
    stmt.run(contradictedById, reflectionId);

    this.logger.debug('Reflection marked as contradicted', { reflectionId, contradictedById });
  }

  // ============================================================================
  // Contradiction Operations
  // ============================================================================

  async createContradiction(input: Omit<Contradiction, 'id'>): Promise<Contradiction> {
    const id = `contra-${nanoid(12)}`;

    const stmt = this.database.db.prepare(`
      INSERT INTO contradictions (
        id, item_a_id, item_a_type, item_b_id, item_b_type, description,
        type, severity, status, resolution, resolved_in_favor_of,
        detected_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.itemAId,
      input.itemAType,
      input.itemBId,
      input.itemBType,
      input.description,
      input.type,
      input.severity,
      input.status,
      input.resolution ?? null,
      input.resolvedInFavorOf ?? null,
      input.detectedAt,
      input.resolvedAt ?? null
    );

    this.logger.info('Contradiction detected', {
      id,
      type: input.type,
      severity: input.severity,
    });

    return this.findContradictionById(id) as Promise<Contradiction>;
  }

  async findContradictionById(id: string): Promise<Contradiction | null> {
    const stmt = this.database.db.prepare('SELECT * FROM contradictions WHERE id = ?');
    const row = stmt.get(id) as ContradictionRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToContradiction(row);
  }

  async findContradictionsByStatus(status: ContradictionStatus): Promise<Contradiction[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM contradictions WHERE status = ? ORDER BY severity DESC, detected_at DESC'
    );
    const rows = stmt.all(status) as ContradictionRow[];

    return rows.map((row) => this.rowToContradiction(row));
  }

  async findContradictionsForItem(
    itemId: string,
    itemType: 'memory' | 'reflection'
  ): Promise<Contradiction[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM contradictions 
      WHERE (item_a_id = ? AND item_a_type = ?) OR (item_b_id = ? AND item_b_type = ?)
      ORDER BY detected_at DESC
    `);
    const rows = stmt.all(itemId, itemType, itemId, itemType) as ContradictionRow[];

    return rows.map((row) => this.rowToContradiction(row));
  }

  async updateContradiction(contradiction: Contradiction): Promise<Contradiction> {
    const stmt = this.database.db.prepare(`
      UPDATE contradictions SET
        description = ?,
        severity = ?,
        status = ?,
        resolution = ?,
        resolved_in_favor_of = ?,
        resolved_at = ?
      WHERE id = ?
    `);

    stmt.run(
      contradiction.description,
      contradiction.severity,
      contradiction.status,
      contradiction.resolution ?? null,
      contradiction.resolvedInFavorOf ?? null,
      contradiction.resolvedAt ?? null,
      contradiction.id
    );

    return this.findContradictionById(contradiction.id) as Promise<Contradiction>;
  }

  async resolveContradiction(
    id: string,
    status: ContradictionStatus,
    resolution?: string,
    resolvedInFavorOf?: string
  ): Promise<Contradiction> {
    const stmt = this.database.db.prepare(`
      UPDATE contradictions SET
        status = ?,
        resolution = ?,
        resolved_in_favor_of = ?,
        resolved_at = ?
      WHERE id = ?
    `);

    stmt.run(status, resolution ?? null, resolvedInFavorOf ?? null, Date.now(), id);

    this.logger.info('Contradiction resolved', { id, status });

    return this.findContradictionById(id) as Promise<Contradiction>;
  }

  async deleteContradiction(id: string): Promise<void> {
    const stmt = this.database.db.prepare('DELETE FROM contradictions WHERE id = ?');
    stmt.run(id);

    this.logger.debug('Contradiction deleted', { id });
  }

  // ============================================================================
  // Provenance Operations
  // ============================================================================

  async setProvenance(provenance: MemoryProvenance): Promise<MemoryProvenance> {
    const stmt = this.database.db.prepare(`
      INSERT OR REPLACE INTO memory_provenance (
        memory_id, source_type, source_id, source_name, trust_score,
        verified, verification_method, verified_by, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      provenance.memoryId,
      provenance.sourceType,
      provenance.sourceId ?? null,
      provenance.sourceName ?? null,
      provenance.trustScore,
      provenance.verified ? 1 : 0,
      provenance.verificationMethod ?? null,
      provenance.verifiedBy ?? null,
      provenance.recordedAt
    );

    this.logger.debug('Provenance set', {
      memoryId: provenance.memoryId,
      sourceType: provenance.sourceType,
    });

    return this.getProvenance(provenance.memoryId) as Promise<MemoryProvenance>;
  }

  async getProvenance(memoryId: string): Promise<MemoryProvenance | null> {
    const stmt = this.database.db.prepare('SELECT * FROM memory_provenance WHERE memory_id = ?');
    const row = stmt.get(memoryId) as ProvenanceRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToProvenance(row);
  }

  async deleteProvenance(memoryId: string): Promise<void> {
    const stmt = this.database.db.prepare('DELETE FROM memory_provenance WHERE memory_id = ?');
    stmt.run(memoryId);
  }

  async findBySourceType(sourceType: ProvenanceSource): Promise<MemoryProvenance[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM memory_provenance WHERE source_type = ? ORDER BY recorded_at DESC'
    );
    const rows = stmt.all(sourceType) as ProvenanceRow[];

    return rows.map((row) => this.rowToProvenance(row));
  }

  async findVerified(): Promise<MemoryProvenance[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM memory_provenance WHERE verified = 1 ORDER BY trust_score DESC'
    );
    const rows = stmt.all() as ProvenanceRow[];

    return rows.map((row) => this.rowToProvenance(row));
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private rowToReflection(row: ReflectionRow): Reflection {
    return {
      id: row.id,
      content: row.content,
      type: row.type as ReflectionType,
      sourceMemoryIds: JSON.parse(row.source_memory_ids),
      confidence: row.confidence,
      evidenceCount: row.evidence_count,
      openQuestions: row.open_questions ? JSON.parse(row.open_questions) : undefined,
      createdAt: row.created_at,
      validatedAt: row.validated_at ?? undefined,
      isContradicted: row.is_contradicted === 1,
      contradictedById: row.contradicted_by_id ?? undefined,
      embedding: row.embedding
        ? Array.from(new Float32Array(row.embedding.buffer))
        : undefined,
    };
  }

  private rowToContradiction(row: ContradictionRow): Contradiction {
    return {
      id: row.id,
      itemAId: row.item_a_id,
      itemAType: row.item_a_type as 'memory' | 'reflection',
      itemBId: row.item_b_id,
      itemBType: row.item_b_type as 'memory' | 'reflection',
      description: row.description,
      type: row.type as ContradictionType,
      severity: row.severity,
      status: row.status as ContradictionStatus,
      resolution: row.resolution ?? undefined,
      resolvedInFavorOf: row.resolved_in_favor_of ?? undefined,
      detectedAt: row.detected_at,
      resolvedAt: row.resolved_at ?? undefined,
    };
  }

  private rowToProvenance(row: ProvenanceRow): MemoryProvenance {
    return {
      memoryId: row.memory_id,
      sourceType: row.source_type as ProvenanceSource,
      sourceId: row.source_id ?? undefined,
      sourceName: row.source_name ?? undefined,
      trustScore: row.trust_score,
      verified: row.verified === 1,
      verificationMethod: row.verification_method ?? undefined,
      verifiedBy: row.verified_by ?? undefined,
      recordedAt: row.recorded_at,
    };
  }
}
