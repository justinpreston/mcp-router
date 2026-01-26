import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IDatabase,
  IWorkflowRepository,
  Workflow,
  WorkflowStatus,
} from '@main/core/interfaces';

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  steps: string;
  trigger: string | null;
  input_schema: string | null;
  status: WorkflowStatus;
  version: number;
  created_at: number;
  updated_at: number;
  last_run_at: number | null;
}

@injectable()
export class WorkflowRepository implements IWorkflowRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(workflow: Workflow): Promise<Workflow> {
    const stmt = this.database.db.prepare(`
      INSERT INTO workflows (
        id, name, description, project_id, steps, trigger, input_schema,
        status, version, created_at, updated_at, last_run_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      workflow.id,
      workflow.name,
      workflow.description || null,
      workflow.projectId || null,
      JSON.stringify(workflow.steps),
      workflow.trigger ? JSON.stringify(workflow.trigger) : null,
      workflow.inputSchema ? JSON.stringify(workflow.inputSchema) : null,
      workflow.status,
      workflow.version,
      workflow.createdAt,
      workflow.updatedAt,
      workflow.lastRunAt || null
    );

    return workflow;
  }

  async findById(id: string): Promise<Workflow | null> {
    const stmt = this.database.db.prepare('SELECT * FROM workflows WHERE id = ?');
    const row = stmt.get(id) as WorkflowRow | undefined;
    return row ? this.mapRowToWorkflow(row) : null;
  }

  async findAll(): Promise<Workflow[]> {
    const stmt = this.database.db.prepare('SELECT * FROM workflows ORDER BY created_at DESC');
    const rows = stmt.all() as WorkflowRow[];
    return rows.map((row) => this.mapRowToWorkflow(row));
  }

  async findByProjectId(projectId: string): Promise<Workflow[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM workflows WHERE project_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(projectId) as WorkflowRow[];
    return rows.map((row) => this.mapRowToWorkflow(row));
  }

  async findByStatus(status: WorkflowStatus): Promise<Workflow[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM workflows WHERE status = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(status) as WorkflowRow[];
    return rows.map((row) => this.mapRowToWorkflow(row));
  }

  async update(workflow: Workflow): Promise<Workflow> {
    const stmt = this.database.db.prepare(`
      UPDATE workflows SET
        name = ?,
        description = ?,
        project_id = ?,
        steps = ?,
        trigger = ?,
        input_schema = ?,
        status = ?,
        version = ?,
        updated_at = ?,
        last_run_at = ?
      WHERE id = ?
    `);

    stmt.run(
      workflow.name,
      workflow.description || null,
      workflow.projectId || null,
      JSON.stringify(workflow.steps),
      workflow.trigger ? JSON.stringify(workflow.trigger) : null,
      workflow.inputSchema ? JSON.stringify(workflow.inputSchema) : null,
      workflow.status,
      workflow.version,
      workflow.updatedAt,
      workflow.lastRunAt || null,
      workflow.id
    );

    return workflow;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare('DELETE FROM workflows WHERE id = ?');
    stmt.run(id);
  }

  private mapRowToWorkflow(row: WorkflowRow): Workflow {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      projectId: row.project_id || undefined,
      steps: JSON.parse(row.steps),
      trigger: row.trigger ? JSON.parse(row.trigger) : undefined,
      inputSchema: row.input_schema ? JSON.parse(row.input_schema) : undefined,
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRunAt: row.last_run_at || undefined,
    };
  }
}
