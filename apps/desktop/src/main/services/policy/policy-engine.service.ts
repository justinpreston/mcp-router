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
   * Returns the decision based on the highest priority matching rule.
   */
  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    const rules = await this.policyRepo.findApplicable(context);

    // Sort by priority (higher priority = evaluated first)
    rules.sort((a, b) => b.priority - a.priority);

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      // Check if pattern matches the resource
      if (!this.matchesPattern(rule.pattern, context.resourceName)) {
        continue;
      }

      // Check conditions if present
      if (rule.conditions && rule.conditions.length > 0) {
        if (!this.evaluateConditions(rule.conditions, context)) {
          continue;
        }
      }

      this.logger.debug('Policy rule matched', {
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        resourceName: context.resourceName,
      });

      return {
        action: rule.action,
        ruleId: rule.id,
        ruleName: rule.name,
        reason: `Matched rule: ${rule.name}`,
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
