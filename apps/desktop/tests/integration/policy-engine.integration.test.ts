/**
 * Integration tests for PolicyEngineService
 * Tests policy evaluation with real database
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container } from 'inversify';
import 'reflect-metadata';

import { TYPES } from '@main/core/types';
import type {
  IPolicyEngine,
  ILogger,
  IDatabase,
  PolicyRule,
} from '@main/core/interfaces';
import { PolicyEngine } from '@main/services/policy/policy-engine.service';
import { PolicyRepository } from '@main/repositories/policy.repository';
import { SqliteDatabase } from '@main/services/core/database.service';
import { createMockLogger } from '../utils';

describe('PolicyEngineService Integration', () => {
  let container: Container;
  let policyEngine: IPolicyEngine;
  let database: IDatabase;

  beforeEach(async () => {
    container = new Container();

    const mockLogger = createMockLogger();
    container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);

    // Create real database service with in-memory SQLite
    const dbService = new SqliteDatabase(mockLogger as any, {} as any);
    (dbService as any).dbPath = ':memory:';
    await dbService.initialize();
    database = dbService;
    container.bind<IDatabase>(TYPES.Database).toConstantValue(database);

    // Real repository
    const policyRepo = new PolicyRepository(database);
    container.bind(TYPES.PolicyRepository).toConstantValue(policyRepo);

    // Real policy engine
    container.bind<IPolicyEngine>(TYPES.PolicyEngine).to(PolicyEngine);

    policyEngine = container.get<IPolicyEngine>(TYPES.PolicyEngine);
  });

  afterEach(async () => {
    if (database) {
      await database.close();
    }
  });

  describe('Policy CRUD', () => {
    it('should create a policy rule', async () => {
      const rule = await policyEngine.addRule({
        name: 'Allow all',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      expect(rule).toBeDefined();
      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('Allow all');
      expect(rule.action).toBe('allow');
    });

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
        resourceType: 'tool',
        pattern: 'dangerous-*',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      const rules = await policyEngine.getRules();

      expect(rules).toHaveLength(2);
    });

    it('should update a rule', async () => {
      const rule = await policyEngine.addRule({
        name: 'Original',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      await policyEngine.updateRule(rule.id, {
        name: 'Updated',
        priority: 50,
      });

      const rules = await policyEngine.getRules();
      const updated = rules.find((r: PolicyRule) => r.id === rule.id);

      expect(updated?.name).toBe('Updated');
      expect(updated?.priority).toBe(50);
    });

    it('should delete a rule', async () => {
      const rule = await policyEngine.addRule({
        name: 'Delete Me',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      await policyEngine.deleteRule(rule.id);

      const rules = await policyEngine.getRules();
      expect(rules).toHaveLength(0);
    });
  });

  describe('Policy Evaluation', () => {
    it('should allow when matching allow rule exists', async () => {
      await policyEngine.addRule({
        name: 'Allow all tools',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      const result = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'read_file',
        clientId: 'client-1',
        serverId: 'server-1',
      });

      expect(result.action).toBe('allow');
    });

    it('should deny when matching deny rule exists', async () => {
      await policyEngine.addRule({
        name: 'Deny dangerous',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'dangerous-*',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      const result = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'dangerous-delete-all',
        clientId: 'client-1',
        serverId: 'server-1',
      });

      expect(result.action).toBe('deny');
    });

    it('should require approval when matching approval rule exists', async () => {
      await policyEngine.addRule({
        name: 'Approve writes',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*.write',
        action: 'require_approval',
        priority: 50,
        enabled: true,
      });

      const result = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'file.write',
        clientId: 'client-1',
        serverId: 'server-1',
      });

      expect(result.action).toBe('require_approval');
    });

    it('should evaluate higher priority rules first', async () => {
      // Lower priority allow all
      await policyEngine.addRule({
        name: 'Allow all',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      // Higher priority deny dangerous
      await policyEngine.addRule({
        name: 'Deny dangerous',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'dangerous-*',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      // dangerous-tool should be denied (higher priority rule)
      const result = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'dangerous-tool',
        clientId: 'client-1',
        serverId: 'server-1',
      });

      expect(result.action).toBe('deny');
    });

    it('should ignore disabled rules', async () => {
      await policyEngine.addRule({
        name: 'Disabled deny',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'deny',
        priority: 100,
        enabled: false, // Disabled
      });

      await policyEngine.addRule({
        name: 'Active allow',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });

      const result = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'any-tool',
        clientId: 'client-1',
        serverId: 'server-1',
      });

      expect(result.action).toBe('allow');
    });

    it('should match server-scoped rules', async () => {
      await policyEngine.addRule({
        name: 'Allow for specific server',
        scope: 'server',
        scopeId: 'trusted-server',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 50,
        enabled: true,
      });

      await policyEngine.addRule({
        name: 'Deny all globally',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'deny',
        priority: 0,
        enabled: true,
      });

      // Trusted server should be allowed
      const trustedResult = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'any-tool',
        clientId: 'client-1',
        serverId: 'trusted-server',
      });
      expect(trustedResult.action).toBe('allow');

      // Other servers should be denied
      const otherResult = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'any-tool',
        clientId: 'client-1',
        serverId: 'other-server',
      });
      expect(otherResult.action).toBe('deny');
    });

    it('should default to deny when no rules match', async () => {
      // No rules added

      const result = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'unknown-tool',
        clientId: 'client-1',
        serverId: 'server-1',
      });

      expect(result.action).toBe('deny');
    });
  });

  describe('Pattern Matching', () => {
    beforeEach(async () => {
      // Add a base allow rule so we can test specific denies
      await policyEngine.addRule({
        name: 'Base allow',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*',
        action: 'allow',
        priority: 0,
        enabled: true,
      });
    });

    it('should match prefix wildcards', async () => {
      await policyEngine.addRule({
        name: 'Deny admin prefix',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'admin-*',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      const match = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'admin-delete',
        clientId: 'c',
        serverId: 's',
      });
      expect(match.action).toBe('deny');

      const noMatch = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'user-delete',
        clientId: 'c',
        serverId: 's',
      });
      expect(noMatch.action).toBe('allow');
    });

    it('should match suffix wildcards', async () => {
      await policyEngine.addRule({
        name: 'Deny delete suffix',
        scope: 'global',
        resourceType: 'tool',
        pattern: '*.delete',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      const match = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'file.delete',
        clientId: 'c',
        serverId: 's',
      });
      expect(match.action).toBe('deny');

      const noMatch = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'file.read',
        clientId: 'c',
        serverId: 's',
      });
      expect(noMatch.action).toBe('allow');
    });

    it('should match exact patterns', async () => {
      await policyEngine.addRule({
        name: 'Deny specific tool',
        scope: 'global',
        resourceType: 'tool',
        pattern: 'very-specific-tool',
        action: 'deny',
        priority: 100,
        enabled: true,
      });

      const match = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'very-specific-tool',
        clientId: 'c',
        serverId: 's',
      });
      expect(match.action).toBe('deny');

      const noMatch = await policyEngine.evaluate({
        resourceType: 'tool',
        resourceName: 'very-specific-tool-extra',
        clientId: 'c',
        serverId: 's',
      });
      expect(noMatch.action).toBe('allow');
    });
  });
});
