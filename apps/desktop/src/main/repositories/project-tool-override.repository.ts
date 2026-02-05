/**
 * Repository for per-project tool visibility overrides.
 * Uses SQLite with JSON serialization for defaultArgs.
 */
import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IDatabase,
  IProjectToolOverrideRepository,
  ProjectToolOverride,
} from '@main/core/interfaces';

interface ProjectToolOverrideRow {
  id: string;
  project_id: string;
  tool_name: string;
  visible: number;
  display_name: string | null;
  default_args: string | null;
  priority: number;
  created_at: number;
  updated_at: number;
}

function mapRowToOverride(row: ProjectToolOverrideRow): ProjectToolOverride {
  return {
    id: row.id,
    projectId: row.project_id,
    toolName: row.tool_name,
    visible: row.visible === 1,
    displayName: row.display_name ?? undefined,
    defaultArgs: row.default_args ? JSON.parse(row.default_args) : undefined,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@injectable()
export class ProjectToolOverrideRepository implements IProjectToolOverrideRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(override: ProjectToolOverride): Promise<ProjectToolOverride> {
    this.database.db
      .prepare(
        `INSERT INTO project_tool_overrides (id, project_id, tool_name, visible, display_name, default_args, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        override.id,
        override.projectId,
        override.toolName,
        override.visible ? 1 : 0,
        override.displayName ?? null,
        override.defaultArgs ? JSON.stringify(override.defaultArgs) : null,
        override.priority,
        override.createdAt,
        override.updatedAt
      );

    return override;
  }

  async findById(id: string): Promise<ProjectToolOverride | null> {
    const row = this.database.db
      .prepare('SELECT * FROM project_tool_overrides WHERE id = ?')
      .get(id) as ProjectToolOverrideRow | undefined;

    return row ? mapRowToOverride(row) : null;
  }

  async findByProjectId(projectId: string): Promise<ProjectToolOverride[]> {
    const rows = this.database.db
      .prepare('SELECT * FROM project_tool_overrides WHERE project_id = ? ORDER BY priority DESC')
      .all(projectId) as ProjectToolOverrideRow[];

    return rows.map(mapRowToOverride);
  }

  async findByProjectAndTool(projectId: string, toolName: string): Promise<ProjectToolOverride | null> {
    const row = this.database.db
      .prepare('SELECT * FROM project_tool_overrides WHERE project_id = ? AND tool_name = ?')
      .get(projectId, toolName) as ProjectToolOverrideRow | undefined;

    return row ? mapRowToOverride(row) : null;
  }

  async update(override: ProjectToolOverride): Promise<ProjectToolOverride> {
    this.database.db
      .prepare(
        `UPDATE project_tool_overrides
         SET visible = ?, display_name = ?, default_args = ?, priority = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        override.visible ? 1 : 0,
        override.displayName ?? null,
        override.defaultArgs ? JSON.stringify(override.defaultArgs) : null,
        override.priority,
        override.updatedAt,
        override.id
      );

    return override;
  }

  async delete(id: string): Promise<void> {
    this.database.db
      .prepare('DELETE FROM project_tool_overrides WHERE id = ?')
      .run(id);
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    this.database.db
      .prepare('DELETE FROM project_tool_overrides WHERE project_id = ?')
      .run(projectId);
  }

  async deleteByProjectAndTool(projectId: string, toolName: string): Promise<void> {
    this.database.db
      .prepare('DELETE FROM project_tool_overrides WHERE project_id = ? AND tool_name = ?')
      .run(projectId, toolName);
  }
}
