import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type { IDatabase, ISkillRepository, Skill, SkillSource } from '@main/core/interfaces';

@injectable()
export class SkillRepository implements ISkillRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(skill: Skill): Promise<Skill> {
    const id = skill.id || nanoid();
    const now = Date.now();

    const stmt = this.database.db.prepare(`
      INSERT INTO skills (
        id, name, description, path, url, source, status,
        server_config, manifest, project_id, tags, enabled, error,
        created_at, updated_at, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      skill.name,
      skill.description || null,
      skill.path || null,
      skill.url || null,
      skill.source,
      skill.status,
      skill.serverConfig ? JSON.stringify(skill.serverConfig) : null,
      skill.manifest ? JSON.stringify(skill.manifest) : null,
      skill.projectId || null,
      JSON.stringify(skill.tags || []),
      skill.enabled ? 1 : 0,
      skill.error || null,
      skill.createdAt || now,
      skill.updatedAt || now,
      skill.lastCheckedAt || null
    );

    const created = await this.findById(id);
    if (!created) {
      throw new Error('Failed to create skill');
    }
    return created;
  }

  async findById(id: string): Promise<Skill | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM skills WHERE id = ?
    `);
    const row = stmt.get(id) as SkillRow | undefined;
    return row ? this.mapRowToSkill(row) : null;
  }

  async findByPath(path: string): Promise<Skill | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM skills WHERE path = ?
    `);
    const row = stmt.get(path) as SkillRow | undefined;
    return row ? this.mapRowToSkill(row) : null;
  }

  async findAll(): Promise<Skill[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM skills ORDER BY name ASC
    `);
    const rows = stmt.all() as SkillRow[];
    return rows.map((row) => this.mapRowToSkill(row));
  }

  async findByProjectId(projectId: string): Promise<Skill[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM skills WHERE project_id = ? ORDER BY name ASC
    `);
    const rows = stmt.all(projectId) as SkillRow[];
    return rows.map((row) => this.mapRowToSkill(row));
  }

  async findBySource(source: SkillSource): Promise<Skill[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM skills WHERE source = ? ORDER BY name ASC
    `);
    const rows = stmt.all(source) as SkillRow[];
    return rows.map((row) => this.mapRowToSkill(row));
  }

  async findEnabled(): Promise<Skill[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM skills WHERE enabled = 1 ORDER BY name ASC
    `);
    const rows = stmt.all() as SkillRow[];
    return rows.map((row) => this.mapRowToSkill(row));
  }

  async update(skill: Skill): Promise<Skill> {
    const existing = await this.findById(skill.id);
    if (!existing) {
      throw new Error(`Skill not found: ${skill.id}`);
    }

    const now = Date.now();

    const stmt = this.database.db.prepare(`
      UPDATE skills SET
        name = ?,
        description = ?,
        path = ?,
        url = ?,
        source = ?,
        status = ?,
        server_config = ?,
        manifest = ?,
        project_id = ?,
        tags = ?,
        enabled = ?,
        error = ?,
        updated_at = ?,
        last_checked_at = ?
      WHERE id = ?
    `);

    stmt.run(
      skill.name,
      skill.description || null,
      skill.path || null,
      skill.url || null,
      skill.source,
      skill.status,
      skill.serverConfig ? JSON.stringify(skill.serverConfig) : null,
      skill.manifest ? JSON.stringify(skill.manifest) : null,
      skill.projectId || null,
      JSON.stringify(skill.tags || []),
      skill.enabled ? 1 : 0,
      skill.error || null,
      now,
      skill.lastCheckedAt || null,
      skill.id
    );

    const updated = await this.findById(skill.id);
    if (!updated) {
      throw new Error(`Skill not found after update: ${skill.id}`);
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      DELETE FROM skills WHERE id = ?
    `);
    stmt.run(id);
  }

  private mapRowToSkill(row: SkillRow): Skill {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      path: row.path || undefined,
      url: row.url || undefined,
      source: row.source as SkillSource,
      status: row.status as Skill['status'],
      serverConfig: row.server_config ? JSON.parse(row.server_config) : undefined,
      manifest: row.manifest ? JSON.parse(row.manifest) : undefined,
      projectId: row.project_id || undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      enabled: row.enabled === 1,
      error: row.error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastCheckedAt: row.last_checked_at || undefined,
    };
  }
}

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  path: string | null;
  url: string | null;
  source: string;
  status: string;
  server_config: string | null;
  manifest: string | null;
  project_id: string | null;
  tags: string | null;
  enabled: number;
  error: string | null;
  created_at: number;
  updated_at: number;
  last_checked_at: number | null;
}
