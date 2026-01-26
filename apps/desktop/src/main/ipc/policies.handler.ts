import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { IPolicyEngine, ILogger, PolicyRule, PolicyScope } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import type { PolicyInfo, PolicyAddConfig } from '@preload/api';

/**
 * Transform internal PolicyRule to API-safe PolicyInfo.
 */
function toPolicyInfo(rule: PolicyRule): PolicyInfo {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    scope: rule.scope,
    scopeId: rule.scopeId,
    resourceType: rule.resourceType,
    pattern: rule.pattern,
    action: rule.action,
    priority: rule.priority,
    enabled: rule.enabled,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

/**
 * Validate policy scope value.
 */
function isValidScope(scope: unknown): scope is PolicyScope {
  return (
    typeof scope === 'string' &&
    ['global', 'workspace', 'server', 'client'].includes(scope)
  );
}

/**
 * Register IPC handlers for policy management.
 */
export function registerPolicyHandlers(container: Container): void {
  const policyEngine = container.get<IPolicyEngine>(TYPES.PolicyEngine);
  const logger = container.get<ILogger>(TYPES.Logger);

  // List policies
  ipcMain.handle('policies:list', async (_event, scope?: string, scopeId?: string) => {
    logger.debug('IPC: policies:list', { scope, scopeId });

    const validScope = scope && isValidScope(scope) ? scope : undefined;
    const rules = await policyEngine.getRules(validScope, scopeId);
    return rules.map(toPolicyInfo);
  });

  // Get single policy
  ipcMain.handle('policies:get', async (_event, id: string) => {
    logger.debug('IPC: policies:get', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid policy ID');
    }

    const rule = await policyEngine.getRule(id);
    return rule ? toPolicyInfo(rule) : null;
  });

  // Add policy
  ipcMain.handle('policies:add', async (_event, config: PolicyAddConfig) => {
    logger.debug('IPC: policies:add', { name: config?.name });

    if (!config || typeof config !== 'object') {
      throw new Error('Invalid policy configuration');
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Policy name is required');
    }

    if (!isValidScope(config.scope)) {
      throw new Error('Invalid policy scope');
    }

    if (!config.resourceType || !['tool', 'server', 'resource'].includes(config.resourceType)) {
      throw new Error('Invalid resource type');
    }

    if (!config.pattern || typeof config.pattern !== 'string') {
      throw new Error('Pattern is required');
    }

    if (!config.action || !['allow', 'deny', 'require_approval'].includes(config.action)) {
      throw new Error('Invalid action');
    }

    const rule = await policyEngine.addRule({
      name: config.name,
      description: config.description,
      scope: config.scope,
      scopeId: config.scopeId,
      resourceType: config.resourceType,
      pattern: config.pattern,
      action: config.action,
      priority: config.priority ?? 0,
      enabled: config.enabled ?? true,
    });

    return toPolicyInfo(rule);
  });

  // Update policy
  ipcMain.handle(
    'policies:update',
    async (_event, id: string, updates: Partial<PolicyAddConfig>) => {
      logger.debug('IPC: policies:update', { id });

      if (!id || typeof id !== 'string') {
        throw new Error('Invalid policy ID');
      }

      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid update data');
      }

      // Validate updates if provided
      if (updates.scope && !isValidScope(updates.scope)) {
        throw new Error('Invalid policy scope');
      }

      if (
        updates.resourceType &&
        !['tool', 'server', 'resource'].includes(updates.resourceType)
      ) {
        throw new Error('Invalid resource type');
      }

      if (
        updates.action &&
        !['allow', 'deny', 'require_approval'].includes(updates.action)
      ) {
        throw new Error('Invalid action');
      }

      const rule = await policyEngine.updateRule(id, updates);
      return toPolicyInfo(rule);
    }
  );

  // Remove policy
  ipcMain.handle('policies:remove', async (_event, id: string) => {
    logger.debug('IPC: policies:remove', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid policy ID');
    }

    await policyEngine.deleteRule(id);
  });
}
