import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IPolicyEngine,
  IPolicyRepository,
  PolicyContext,
} from '@main/core/interfaces';
import { PolicyEngine } from '../policy-engine.service';
import { PolicyRepository } from '@main/repositories/policy.repository';
import { createTestContainer } from '@tests/utils';

describe('PolicyEngine', () => {
  let container: Container;
  let policyEngine: IPolicyEngine;

  beforeEach(() => {
    container = createTestContainer();
    container.bind<IPolicyRepository>(TYPES.PolicyRepository).to(PolicyRepository);
    container.bind<IPolicyEngine>(TYPES.PolicyEngine).to(PolicyEngine);

    policyEngine = container.get<IPolicyEngine>(TYPES.PolicyEngine);

    vi.clearAllMocks();
  });

  describe('addRule', () => {
    it('should create a new policy rule with generated ID', async () => {
      const rule = await policyEngine.addRule({
        name: 'Test Rule',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('Test Rule');
      expect(rule.scope).toBe('global');
      expect(rule.action).toBe('allow');
    });

    it('should set timestamps on creation', async () => {
      const beforeTime = Date.now();

      const rule = await policyEngine.addRule({
        name: 'Test Rule',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      const afterTime = Date.now();

      expect(rule.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(rule.createdAt).toBeLessThanOrEqual(afterTime);
      expect(rule.updatedAt).toBe(rule.createdAt);
    });
  });

  describe('evaluate', () => {
    it('should allow by default when no rules match', async () => {
      const context: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'test-tool',
      };

      const decision = await policyEngine.evaluate(context);

      expect(decision.action).toBe('allow');
      expect(decision.reason).toContain('default');
    });

    it('should match exact pattern', async () => {
      await policyEngine.addRule({
        name: 'Deny specific tool',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'dangerous-tool',
        action: 'deny',
        priority: 10,
        enabled: true,
      });

      const context: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'dangerous-tool',
      };

      const decision = await policyEngine.evaluate(context);

      expect(decision.action).toBe('deny');
    });

    it('should match glob pattern with wildcard', async () => {
      await policyEngine.addRule({
        name: 'Deny all dangerous tools',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'dangerous-*',
        action: 'deny',
        priority: 10,
        enabled: true,
      });

      const context: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'dangerous-delete-all',
      };

      const decision = await policyEngine.evaluate(context);

      expect(decision.action).toBe('deny');
    });

    it('should not match different pattern', async () => {
      await policyEngine.addRule({
        name: 'Deny dangerous tools',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'dangerous-*',
        action: 'deny',
        priority: 10,
        enabled: true,
      });

      const context: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'safe-tool',
      };

      const decision = await policyEngine.evaluate(context);

      expect(decision.action).toBe('allow');
    });

    it('should respect priority ordering (higher priority wins)', async () => {
      // Low priority allow
      await policyEngine.addRule({
        name: 'Allow all',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      // High priority deny
      await policyEngine.addRule({
        name: 'Deny specific',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'blocked-*',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      const context: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'blocked-tool',
      };

      const decision = await policyEngine.evaluate(context);

      expect(decision.action).toBe('deny');
    });

    it('should skip disabled rules', async () => {
      await policyEngine.addRule({
        name: 'Disabled deny rule',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'deny',
        priority: 100,
        enabled: false, // Disabled
      });

      const context: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'any-tool',
      };

      const decision = await policyEngine.evaluate(context);

      // Should default allow since the deny rule is disabled
      expect(decision.action).toBe('allow');
    });

    it('should filter by resource type', async () => {
      await policyEngine.addRule({
        name: 'Deny server access',
        scope: 'global',
        resourceType: 'server',
        pattern: '*',
        action: 'deny',
        priority: 10,
        enabled: true,
      });

      const toolContext: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'any-tool',
      };

      const decision = await policyEngine.evaluate(toolContext);

      // Rule is for servers, not tools - should not apply
      expect(decision.action).toBe('allow');
    });

    it('should apply scope-specific rules', async () => {
      await policyEngine.addRule({
        name: 'Client-specific deny',
        scope: 'client',
        scopeId: 'restricted-client',
        resourceType: 'tool',
        pattern: '*',
        action: 'deny',
        priority: 10,
        enabled: true,
      });

      // Restricted client context
      const restrictedContext: PolicyContext = {
        clientId: 'restricted-client',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'any-tool',
      };

      const restrictedDecision = await policyEngine.evaluate(restrictedContext);
      expect(restrictedDecision.action).toBe('deny');

      // Normal client context
      const normalContext: PolicyContext = {
        clientId: 'normal-client',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'any-tool',
      };

      const normalDecision = await policyEngine.evaluate(normalContext);
      expect(normalDecision.action).toBe('allow');
    });

    it('should return require_approval action', async () => {
      await policyEngine.addRule({
        name: 'Require approval for dangerous operations',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'admin-*',
        action: 'require_approval',
        priority: 50,
        enabled: true,
      });

      const context: PolicyContext = {
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'admin-delete-user',
      };

      const decision = await policyEngine.evaluate(context);

      expect(decision.action).toBe('require_approval');
    });
  });

  describe('updateRule', () => {
    it('should update rule properties', async () => {
      const rule = await policyEngine.addRule({
        name: 'Original Name',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      const updated = await policyEngine.updateRule(rule.id, {
        name: 'Updated Name',
        priority: 100,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.priority).toBe(100);
      expect(updated.updatedAt).toBeGreaterThan(rule.createdAt);
    });

    it('should throw error for non-existent rule', async () => {
      await expect(
        policyEngine.updateRule('non-existent-id', { name: 'New Name' })
      ).rejects.toThrow();
    });
  });

  describe('deleteRule', () => {
    it('should remove rule from evaluation', async () => {
      const rule = await policyEngine.addRule({
        name: 'Deny all',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      // Verify rule is active
      let decision = await policyEngine.evaluate({
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'any-tool',
      });
      expect(decision.action).toBe('deny');

      // Delete rule
      await policyEngine.deleteRule(rule.id);

      // Verify rule no longer applies
      decision = await policyEngine.evaluate({
        clientId: 'client-1',
        serverId: 'server-1',
        resourceType: 'tool',
        resourceName: 'any-tool',
      });
      expect(decision.action).toBe('allow');
    });
  });

  describe('getRules', () => {
    it('should list all rules', async () => {
      await policyEngine.addRule({
        name: 'Rule 1',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      await policyEngine.addRule({
        name: 'Rule 2',
        scope: 'global',
        resourceType: 'server',
        pattern: '*',
        action: 'deny',
        priority: 10,
        enabled: true,
      });

      const rules = await policyEngine.getRules();

      expect(rules.length).toBe(2);
    });

    it('should filter rules by scope', async () => {
      await policyEngine.addRule({
        name: 'Global Rule',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      await policyEngine.addRule({
        name: 'Client Rule',
        scope: 'client',
        scopeId: 'client-1',
        resourceType: 'tool',
        pattern: '*',
        action: 'deny',
        priority: 10,
        enabled: true,
      });

      const globalRules = await policyEngine.getRules('global');
      const clientRules = await policyEngine.getRules('client', 'client-1');

      expect(globalRules.length).toBe(1);
      expect(globalRules[0]?.name).toBe('Global Rule');
      expect(clientRules.length).toBe(1);
      expect(clientRules[0]?.name).toBe('Client Rule');
    });
  });

  describe('getRule', () => {
    it('should return rule by ID', async () => {
      const created = await policyEngine.addRule({
        name: 'Test Rule',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      const retrieved = await policyEngine.getRule(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Rule');
    });

    it('should return null for non-existent rule', async () => {
      const result = await policyEngine.getRule('non-existent-id');

      expect(result).toBeNull();
    });
  });
});
