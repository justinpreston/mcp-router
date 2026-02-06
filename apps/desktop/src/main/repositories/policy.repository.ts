import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IPolicyRepository,
  IDatabase,
  PolicyRule,
  PolicyContext,
  PolicyScope,
  PolicyResourceType,
  PolicyAction,
} from '@main/core/interfaces';

/**
 * Policy repository for SQLite persistence.
 */
@injectable()
export class PolicyRepository implements IPolicyRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(rule: PolicyRule): Promise<PolicyRule> {
    const stmt = this.database.db.prepare(`
      INSERT INTO policies (
        id, name, description, scope, scope_id, resource_type,
        pattern, action, priority, conditions, redact_fields, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      rule.id,
      rule.name,
      rule.description ?? null,
      rule.scope,
      rule.scopeId ?? null,
      rule.resourceType,
      rule.pattern,
      rule.action,
      rule.priority,
      rule.conditions ? JSON.stringify(rule.conditions) : null,
      rule.redactFields ? JSON.stringify(rule.redactFields) : null,
      rule.enabled ? 1 : 0,
      rule.createdAt,
      rule.updatedAt
    );

    return rule;
  }

  async findById(id: string): Promise<PolicyRule | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM policies WHERE id = ?
    `);

    const row = stmt.get(id) as PolicyRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToPolicy(row);
  }

  async findAll(): Promise<PolicyRule[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM policies ORDER BY priority DESC, created_at DESC
    `);

    const rows = stmt.all() as PolicyRow[];
    return rows.map(row => this.mapRowToPolicy(row));
  }

  async findByScope(scope: PolicyScope, scopeId?: string): Promise<PolicyRule[]> {
    let stmt;
    let rows: PolicyRow[];

    if (scopeId) {
      stmt = this.database.db.prepare(`
        SELECT * FROM policies
        WHERE scope = ? AND scope_id = ?
        ORDER BY priority DESC, created_at DESC
      `);
      rows = stmt.all(scope, scopeId) as PolicyRow[];
    } else {
      stmt = this.database.db.prepare(`
        SELECT * FROM policies
        WHERE scope = ?
        ORDER BY priority DESC, created_at DESC
      `);
      rows = stmt.all(scope) as PolicyRow[];
    }

    return rows.map(row => this.mapRowToPolicy(row));
  }

  async findApplicable(context: PolicyContext): Promise<PolicyRule[]> {
    // Find rules that could apply to this context
    // Rules are applicable if:
    // 1. They match the resource type
    // 2. Their scope matches (global, or specific workspace/server/client)
    const stmt = this.database.db.prepare(`
      SELECT * FROM policies
      WHERE enabled = 1
        AND resource_type = ?
        AND (
          scope = 'global'
          OR (scope = 'workspace' AND scope_id = ?)
          OR (scope = 'server' AND scope_id = ?)
          OR (scope = 'client' AND scope_id = ?)
        )
      ORDER BY priority DESC
    `);

    const rows = stmt.all(
      context.resourceType,
      context.workspaceId ?? '',
      context.serverId,
      context.clientId
    ) as PolicyRow[];

    return rows.map(row => this.mapRowToPolicy(row));
  }

  async update(rule: PolicyRule): Promise<PolicyRule> {
    const stmt = this.database.db.prepare(`
      UPDATE policies SET
        name = ?,
        description = ?,
        scope = ?,
        scope_id = ?,
        resource_type = ?,
        pattern = ?,
        action = ?,
        priority = ?,
        conditions = ?,
        redact_fields = ?,
        enabled = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      rule.name,
      rule.description ?? null,
      rule.scope,
      rule.scopeId ?? null,
      rule.resourceType,
      rule.pattern,
      rule.action,
      rule.priority,
      rule.conditions ? JSON.stringify(rule.conditions) : null,
      rule.redactFields ? JSON.stringify(rule.redactFields) : null,
      rule.enabled ? 1 : 0,
      rule.updatedAt,
      rule.id
    );

    return rule;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      DELETE FROM policies WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Map database row to PolicyRule object.
   */
  private mapRowToPolicy(row: PolicyRow): PolicyRule {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      scope: row.scope as PolicyScope,
      scopeId: row.scope_id ?? undefined,
      resourceType: row.resource_type as PolicyResourceType,
      pattern: row.pattern,
      action: row.action as PolicyAction,
      priority: row.priority,
      conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
      redactFields: row.redact_fields ? JSON.parse(row.redact_fields) : undefined,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Database row type for policies table.
 */
interface PolicyRow {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  scope_id: string | null;
  resource_type: string;
  pattern: string;
  action: string;
  priority: number;
  conditions: string | null;
  redact_fields: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}
