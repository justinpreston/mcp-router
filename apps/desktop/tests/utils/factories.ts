import { nanoid } from 'nanoid';
import type {
  Token,
  MCPServer,
  Workspace,
  PolicyRule,
  Memory,
  AuditEvent,
  ApprovalRequest,
  ServerStatus,
  ServerTransport,
  PolicyScope,
  PolicyResourceType,
  PolicyAction,
  AuditEventType,
  ApprovalStatus,
} from '@main/core/interfaces';

/**
 * Factory for creating mock Token objects.
 */
export function createMockToken(overrides?: Partial<Token>): Token {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: `mcpr_${nanoid(43)}`,
    clientId: `client-${nanoid(8)}`,
    name: 'Test Token',
    issuedAt: now,
    expiresAt: now + 86400, // 24 hours
    scopes: ['default'],
    serverAccess: {},
    ...overrides,
  };
}

/**
 * Factory for creating an expired token.
 */
export function createExpiredToken(overrides?: Partial<Token>): Token {
  const now = Math.floor(Date.now() / 1000);

  return createMockToken({
    issuedAt: now - 172800, // 2 days ago
    expiresAt: now - 86400, // 1 day ago (expired)
    ...overrides,
  });
}

/**
 * Factory for creating mock MCPServer objects.
 */
export function createMockServer(overrides?: Partial<MCPServer>): MCPServer {
  const now = Date.now();

  return {
    id: `server-${nanoid(8)}`,
    name: 'Test Server',
    command: 'node',
    args: ['server.js'],
    transport: 'stdio' as ServerTransport,
    status: 'stopped' as ServerStatus,
    toolPermissions: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Factory for creating a running server.
 */
export function createRunningServer(overrides?: Partial<MCPServer>): MCPServer {
  return createMockServer({
    status: 'running',
    ...overrides,
  });
}

/**
 * Factory for creating mock Workspace objects.
 */
export function createMockWorkspace(overrides?: Partial<Workspace>): Workspace {
  const now = Date.now();

  return {
    id: `workspace-${nanoid(8)}`,
    name: 'Test Workspace',
    path: '/tmp/test-workspace',
    serverIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Factory for creating mock PolicyRule objects.
 */
export function createMockPolicy(overrides?: Partial<PolicyRule>): PolicyRule {
  const now = Date.now();

  return {
    id: `policy-${nanoid(8)}`,
    name: 'Test Policy',
    description: 'A test policy',
    scope: 'global' as PolicyScope,
    resourceType: 'tool' as PolicyResourceType,
    pattern: '*',
    action: 'allow' as PolicyAction,
    priority: 0,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Factory for creating a deny policy.
 */
export function createDenyPolicy(overrides?: Partial<PolicyRule>): PolicyRule {
  return createMockPolicy({
    name: 'Deny Policy',
    action: 'deny',
    priority: 100, // Higher priority
    ...overrides,
  });
}

/**
 * Factory for creating an approval-required policy.
 */
export function createApprovalPolicy(overrides?: Partial<PolicyRule>): PolicyRule {
  return createMockPolicy({
    name: 'Approval Required Policy',
    action: 'require_approval',
    priority: 50,
    ...overrides,
  });
}

/**
 * Factory for creating mock Memory objects.
 */
export function createMockMemory(overrides?: Partial<Memory>): Memory {
  const now = Date.now();
  const content = overrides?.content ?? 'Test memory content';

  return {
    id: `memory-${nanoid(8)}`,
    content,
    contentHash: `hash-${nanoid(16)}`,
    tags: ['test'],
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    ...overrides,
  };
}

/**
 * Factory for creating mock AuditEvent objects.
 */
export function createMockAuditEvent(overrides?: Partial<AuditEvent>): AuditEvent {
  return {
    id: `audit-${nanoid(8)}`,
    type: 'tool.call' as AuditEventType,
    success: true,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Factory for creating mock ApprovalRequest objects.
 */
export function createMockApprovalRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  const now = Date.now();

  return {
    id: `approval-${nanoid(8)}`,
    clientId: `client-${nanoid(8)}`,
    serverId: `server-${nanoid(8)}`,
    toolName: 'test-tool',
    toolArguments: { arg1: 'value1' },
    policyRuleId: `policy-${nanoid(8)}`,
    status: 'pending' as ApprovalStatus,
    requestedAt: now,
    expiresAt: now + 300000, // 5 minutes
    ...overrides,
  };
}

/**
 * Factory for creating multiple tokens.
 */
export function createMockTokens(count: number, overrides?: Partial<Token>): Token[] {
  return Array.from({ length: count }, (_, i) =>
    createMockToken({
      name: `Test Token ${i + 1}`,
      ...overrides,
    })
  );
}

/**
 * Factory for creating multiple servers.
 */
export function createMockServers(count: number, overrides?: Partial<MCPServer>): MCPServer[] {
  return Array.from({ length: count }, (_, i) =>
    createMockServer({
      name: `Test Server ${i + 1}`,
      ...overrides,
    })
  );
}

/**
 * Factory for creating multiple policies.
 */
export function createMockPolicies(count: number, overrides?: Partial<PolicyRule>): PolicyRule[] {
  return Array.from({ length: count }, (_, i) =>
    createMockPolicy({
      name: `Test Policy ${i + 1}`,
      priority: i,
      ...overrides,
    })
  );
}
