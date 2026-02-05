import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IPolicyEngine,
  IPolicyRepository,
  ILogger,
  PolicyRule,
  PolicyContext,
  PolicyDecision,
  PolicyScope,
  PolicyCondition,
} from '@main/core/interfaces';
import { SCOPE_SPECIFICITY } from '@main/core/interfaces';

/**
 * Policy engine for evaluating access control rules.
 * Supports glob patterns, priority-based evaluation, and conditional logic.
 */
@injectable()
export class PolicyEngine implements IPolicyEngine {
  constructor(
    @inject(TYPES.PolicyRepository) private policyRepo: IPolicyRepository,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  /**
   * Evaluate policy rules against a given context.
   * Uses scope-based precedence: client > server/workspace > global.
   * Within the same scope specificity, higher priority wins, then newest.
   * Returns the decision from the most specific matching rule.
   */
  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    const rules = await this.policyRepo.findApplicable(context);

    // Find all matching rules with their scope specificity
    const matches: Array<{ rule: PolicyRule; specificity: number }> = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (!this.matchesPattern(rule.pattern, context.resourceName)) continue;
      if (rule.conditions && rule.conditions.length > 0) {
        if (!this.evaluateConditions(rule.conditions, context)) continue;
      }
      const specificity = SCOPE_SPECIFICITY[rule.scope] ?? 0;
      matches.push({ rule, specificity });
    }

    // Sort: highest specificity first, then highest priority, then newest
    matches.sort((a, b) => {
      if (b.specificity !== a.specificity) return b.specificity - a.specificity;
      if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority;
      return b.rule.createdAt - a.rule.createdAt;
    });

    if (matches.length > 0) {
      const best = matches[0]!;

      this.logger.debug('Policy rule matched', {
        ruleId: best.rule.id,
        ruleName: best.rule.name,
        action: best.rule.action,
        scope: best.rule.scope,
        specificity: best.specificity,
        resourceName: context.resourceName,
      });

      return {
        action: best.rule.action,
        ruleId: best.rule.id,
        ruleName: best.rule.name,
        reason: `Matched rule: ${best.rule.name} (scope: ${best.rule.scope})`,
        redactions: best.rule.action === 'redact' ? best.rule.redactFields : undefined,
      };
    }

    // Default: allow if no rules match
    this.logger.debug('No policy rules matched, defaulting to allow', {
      resourceName: context.resourceName,
      resourceType: context.resourceType,
    });

    return {
      action: 'allow',
      reason: 'No matching rules, default allow',
    };
  }

  /**
   * Apply field-level redactions to a data object.
   * Supports dot-notation paths for nested fields (e.g., 'auth.password').
   * Fields matching the paths are replaced with '[REDACTED]'.
   */
  applyRedactions(
    data: Record<string, unknown>,
    redactions: string[]
  ): Record<string, unknown> {
    const redacted = { ...data };

    for (const fieldPath of redactions) {
      if (fieldPath.includes('.')) {
        // Handle nested paths: 'auth.password' → mask data.auth.password
        const parts = fieldPath.split('.');
        let current: Record<string, unknown> = redacted;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]!;
          if (current[part] !== undefined && typeof current[part] === 'object' && current[part] !== null) {
            current[part] = { ...(current[part] as Record<string, unknown>) };
            current = current[part] as Record<string, unknown>;
          } else {
            break;
          }
        }

        const lastKey = parts[parts.length - 1]!;
        if (lastKey in current) {
          current[lastKey] = '[REDACTED]';
        }
      } else {
        // Top-level field
        if (fieldPath in redacted) {
          redacted[fieldPath] = '[REDACTED]';
        }
      }
    }

    return redacted;
  }

  async addRule(
    rule: Omit<PolicyRule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PolicyRule> {
    const now = Date.now();
    const newRule: PolicyRule = {
      id: `policy-${nanoid(12)}`,
      ...rule,
      createdAt: now,
      updatedAt: now,
    };

    await this.policyRepo.create(newRule);

    this.logger.info('Policy rule created', {
      ruleId: newRule.id,
      name: newRule.name,
      action: newRule.action,
    });

    return newRule;
  }

  async updateRule(ruleId: string, updates: Partial<PolicyRule>): Promise<PolicyRule> {
    const existing = await this.policyRepo.findById(ruleId);

    if (!existing) {
      throw new Error(`Policy rule not found: ${ruleId}`);
    }

    // Don't allow updating certain fields
    const { id: _id, createdAt: _createdAt, ...allowedUpdates } = updates;

    const updatedRule: PolicyRule = {
      ...existing,
      ...allowedUpdates,
      updatedAt: Date.now(),
    };

    await this.policyRepo.update(updatedRule);

    this.logger.info('Policy rule updated', { ruleId });
    return updatedRule;
  }

  async deleteRule(ruleId: string): Promise<void> {
    const existing = await this.policyRepo.findById(ruleId);

    if (!existing) {
      throw new Error(`Policy rule not found: ${ruleId}`);
    }

    await this.policyRepo.delete(ruleId);

    this.logger.info('Policy rule deleted', { ruleId });
  }

  async getRules(scope?: PolicyScope, scopeId?: string): Promise<PolicyRule[]> {
    if (scope) {
      return this.policyRepo.findByScope(scope, scopeId);
    }
    return this.policyRepo.findAll();
  }

  async getRule(ruleId: string): Promise<PolicyRule | null> {
    return this.policyRepo.findById(ruleId);
  }

  /**
   * Check if a resource name matches a glob pattern.
   * Supports * for any characters and ** for recursive matching.
   */
  private matchesPattern(pattern: string, resourceName: string): boolean {
    // Exact match
    if (pattern === resourceName) {
      return true;
    }

    // Wildcard match all
    if (pattern === '*' || pattern === '**') {
      return true;
    }

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*\*/g, '{{DOUBLE_STAR}}') // Temporarily replace **
      .replace(/\*/g, '[^/]*') // * matches anything except /
      .replace(/{{DOUBLE_STAR}}/g, '.*') // ** matches anything
      .replace(/\?/g, '.'); // ? matches single char

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(resourceName);
  }

  /**
   * Evaluate all conditions against the context.
   * All conditions must match (AND logic).
   */
  private evaluateConditions(
    conditions: PolicyCondition[],
    context: PolicyContext
  ): boolean {
    return conditions.every(condition => this.evaluateCondition(condition, context));
  }

  /**
   * Evaluate a single condition against the context.
   */
  private evaluateCondition(condition: PolicyCondition, context: PolicyContext): boolean {
    const fieldValue = this.getFieldValue(condition.field, context);

    if (fieldValue === undefined) {
      return false;
    }

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;

      case 'contains':
        if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
          return fieldValue.includes(condition.value);
        }
        return false;

      case 'matches':
        if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
          try {
            const regex = new RegExp(condition.value);
            return regex.test(fieldValue);
          } catch {
            this.logger.warn('Invalid regex in policy condition', {
              pattern: condition.value,
            });
            return false;
          }
        }
        return false;

      case 'greater_than':
        if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
          return fieldValue > condition.value;
        }
        return false;

      case 'less_than':
        if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
          return fieldValue < condition.value;
        }
        return false;

      default:
        this.logger.warn('Unknown condition operator', {
          operator: condition.operator,
        });
        return false;
    }
  }

  /**
   * Get a field value from the context.
   * Supports dot notation for nested fields in metadata.
   */
  private getFieldValue(
    field: string,
    context: PolicyContext
  ): string | number | boolean | undefined {
    // Direct context fields
    const directFields: Record<string, unknown> = {
      clientId: context.clientId,
      serverId: context.serverId,
      workspaceId: context.workspaceId,
      resourceType: context.resourceType,
      resourceName: context.resourceName,
    };

    if (field in directFields) {
      return directFields[field] as string | number | boolean | undefined;
    }

    // Check metadata with dot notation
    if (field.startsWith('metadata.') && context.metadata) {
      const metadataField = field.slice(9); // Remove 'metadata.'
      return this.getNestedValue(context.metadata, metadataField);
    }

    return undefined;
  }

  /**
   * Get a nested value from an object using dot notation.
   */
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): string | number | boolean | undefined {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    if (
      typeof current === 'string' ||
      typeof current === 'number' ||
      typeof current === 'boolean'
    ) {
      return current;
    }

    return undefined;
  }
}
