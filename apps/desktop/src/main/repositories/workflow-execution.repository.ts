import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IDatabase,
  IWorkflowExecutionRepository,
  WorkflowExecution,
  WorkflowStatus,
} from '@main/core/interfaces';

interface ExecutionRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  workflow_version: number;
  status: WorkflowStatus;
  input: string | null;
  output: string | null;
  error: string | null;
  steps: string;
  current_step_id: string | null;
  started_at: number;
  completed_at: number | null;
  triggered_by: string | null;
}

@injectable()
export class WorkflowExecutionRepository implements IWorkflowExecutionRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(execution: WorkflowExecution): Promise<WorkflowExecution> {
    const stmt = this.database.db.prepare(`
      INSERT INTO workflow_executions (
        id, workflow_id, workflow_name, workflow_version, status,
        input, output, error, steps, current_step_id,
        started_at, completed_at, triggered_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.workflowId,
      execution.workflowName,
      execution.workflowVersion,
      execution.status,
      execution.input ? JSON.stringify(execution.input) : null,
      execution.output !== undefined ? JSON.stringify(execution.output) : null,
      execution.error || null,
      JSON.stringify(execution.steps),
      execution.currentStepId || null,
      execution.startedAt,
      execution.completedAt || null,
      execution.triggeredBy || null
    );

    return execution;
  }

  async findById(id: string): Promise<WorkflowExecution | null> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM workflow_executions WHERE id = ?'
    );
    const row = stmt.get(id) as ExecutionRow | undefined;
    return row ? this.mapRowToExecution(row) : null;
  }

  async findByWorkflowId(
    workflowId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<WorkflowExecution[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const stmt = this.database.db.prepare(`
      SELECT * FROM workflow_executions 
      WHERE workflow_id = ? 
      ORDER BY started_at DESC 
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(workflowId, limit, offset) as ExecutionRow[];
    return rows.map((row) => this.mapRowToExecution(row));
  }

  async findByStatus(status: WorkflowStatus): Promise<WorkflowExecution[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM workflow_executions 
      WHERE status = ? 
      ORDER BY started_at DESC
    `);
    const rows = stmt.all(status) as ExecutionRow[];
    return rows.map((row) => this.mapRowToExecution(row));
  }

  async update(execution: WorkflowExecution): Promise<WorkflowExecution> {
    const stmt = this.database.db.prepare(`
      UPDATE workflow_executions SET
        status = ?,
        output = ?,
        error = ?,
        steps = ?,
        current_step_id = ?,
        completed_at = ?
      WHERE id = ?
    `);

    stmt.run(
      execution.status,
      execution.output !== undefined ? JSON.stringify(execution.output) : null,
      execution.error || null,
      JSON.stringify(execution.steps),
      execution.currentStepId || null,
      execution.completedAt || null,
      execution.id
    );

    return execution;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(
      'DELETE FROM workflow_executions WHERE id = ?'
    );
    stmt.run(id);
  }

  private mapRowToExecution(row: ExecutionRow): WorkflowExecution {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      workflowVersion: row.workflow_version,
      status: row.status,
      input: row.input ? JSON.parse(row.input) : undefined,
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error || undefined,
      steps: JSON.parse(row.steps),
      currentStepId: row.current_step_id || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      triggeredBy: row.triggered_by || undefined,
    };
  }
}
