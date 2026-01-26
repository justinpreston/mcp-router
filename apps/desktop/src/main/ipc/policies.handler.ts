import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { IPolicyEngine, ILogger, PolicyRule, PolicyScope } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import type { PolicyInfo, PolicyAddConfig } from '@preload/api';
import {
  PolicyId,
  PolicyAddConfigSchema,
  PolicyUpdateConfigSchema,
  PolicyScopeSchema,
  validateInput,
} from './validation-schemas';

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
 * Register IPC handlers for policy management.
 */
export function registerPolicyHandlers(container: Container): void {
  const policyEngine = container.get<IPolicyEngine>(TYPES.PolicyEngine);
  const logger = container.get<ILogger>(TYPES.Logger);

  // List policies
  ipcMain.handle('policies:list', async (_event, scope?: unknown, scopeId?: unknown) => {
    logger.debug('IPC: policies:list', { scope, scopeId });

    // Validate scope if provided
    const validScope = scope ? validateInput(PolicyScopeSchema, scope) : undefined;
    const validScopeId = scopeId && typeof scopeId === 'string' ? scopeId : undefined;
    
    const rules = await policyEngine.getRules(validScope, validScopeId);
    return rules.map(toPolicyInfo);
  });

  // Get single policy
  ipcMain.handle('policies:get', async (_event, id: unknown) => {
    logger.debug('IPC: policies:get', { id });

    const validId = validateInput(PolicyId, id);
    const rule = await policyEngine.getRule(validId);
    return rule ? toPolicyInfo(rule) : null;
  });

  // Add policy
  ipcMain.handle('policies:add', async (_event, config: unknown) => {
    logger.debug('IPC: policies:add', { config });

    const validConfig = validateInput(PolicyAddConfigSchema, config);
    
    const rule = await policyEngine.addRule({
      name: validConfig.name,
      description: validConfig.description,
      scope: validConfig.scope as PolicyScope,
      scopeId: validConfig.scopeId,
      resourceType: validConfig.resourceType,
      pattern: validConfig.pattern,
      action: validConfig.action,
      priority: validConfig.priority ?? 0,
      enabled: validConfig.enabled ?? true,
    });

    return toPolicyInfo(rule);
  });

  // Update policy
  ipcMain.handle(
    'policies:update',
    async (_event, id: unknown, updates: unknown) => {
      logger.debug('IPC: policies:update', { id });

      const validId = validateInput(PolicyId, id);
      const validUpdates = validateInput(PolicyUpdateConfigSchema, updates);

      const rule = await policyEngine.updateRule(validId, validUpdates as Partial<PolicyAddConfig>);
      return toPolicyInfo(rule);
    }
  );

  // Remove policy
  ipcMain.handle('policies:remove', async (_event, id: unknown) => {
    logger.debug('IPC: policies:remove', { id });

    const validId = validateInput(PolicyId, id);
    await policyEngine.deleteRule(validId);
  });
}
