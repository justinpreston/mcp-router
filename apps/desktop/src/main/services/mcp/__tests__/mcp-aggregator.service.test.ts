import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IMcpAggregator,
  IMcpClientFactory,
  IServerManager,
  ITokenValidator,
  IPolicyEngine,
  IApprovalQueue,
  IRateLimiter,
  IAuditService,
  ILogger,
  IMcpClient,
  MCPServer,
  Token,
  PolicyDecision,
  ApprovalRequest,
} from '@main/core/interfaces';
import { McpAggregator } from '../mcp-aggregator.service';
import { createMockLogger, createMockServer, createMockToken } from '@tests/utils';

describe('McpAggregator', () => {
  let container: Container;
  let aggregator: IMcpAggregator;
  let mockClientFactory: IMcpClientFactory;
  let mockServerManager: IServerManager;
  let mockTokenValidator: ITokenValidator;
  let mockPolicyEngine: IPolicyEngine;
  let mockApprovalQueue: IApprovalQueue;
  let mockRateLimiter: IRateLimiter;
  let mockAuditService: IAuditService;
  let mockLogger: ILogger;
  let mockClient: IMcpClient;

  beforeEach(() => {
    container = new Container();
    mockLogger = createMockLogger();

    // Create mock client
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      setOptions: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      listTools: vi.fn().mockResolvedValue([
        { name: 'read_file', description: 'Read a file', inputSchema: {} },
      ]),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'File contents' }],
      }),
      listResources: vi.fn().mockResolvedValue([]),
      readResource: vi.fn().mockResolvedValue([]),
      listPrompts: vi.fn().mockResolvedValue([]),
      getPrompt: vi.fn().mockResolvedValue({ messages: [] }),
      serverCapabilities: {},
    };

    // Create mock client factory
    mockClientFactory = {
      createClient: vi.fn().mockReturnValue(mockClient),
      getClient: vi.fn().mockReturnValue(mockClient),
      destroyClient: vi.fn(),
      getAllClients: vi.fn().mockReturnValue(new Map()),
    };

    // Create mock server manager
    const mockServer = createMockServer({ id: 'test-server', name: 'Test Server', status: 'running' });
    mockServerManager = {
      getServer: vi.fn().mockReturnValue(mockServer),
      listServers: vi.fn().mockReturnValue([mockServer]),
      getAllServers: vi.fn().mockReturnValue([mockServer]),
      getRunningServers: vi.fn().mockReturnValue([mockServer]),
      getServerTools: vi.fn().mockResolvedValue([
        { name: 'read_file', description: 'Read a file', inputSchema: {} },
      ]),
      addServer: vi.fn(),
      updateServer: vi.fn(),
      removeServer: vi.fn(),
      startServer: vi.fn(),
      stopServer: vi.fn(),
    };

    // Create mock token validator
    const mockToken = createMockToken({ clientId: 'test-client' });
    mockTokenValidator = {
      validate: vi.fn().mockResolvedValue({ valid: true, token: mockToken }),
      validateForServer: vi.fn().mockResolvedValue({ valid: true, token: mockToken }),
    };

    // Create mock policy engine
    mockPolicyEngine = {
      evaluate: vi.fn().mockResolvedValue({ action: 'allow' } as PolicyDecision),
      addRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
      getRules: vi.fn().mockResolvedValue([]),
      getRule: vi.fn(),
    };

    // Create mock approval queue
    mockApprovalQueue = {
      createRequest: vi.fn().mockResolvedValue({
        id: 'approval-1',
        status: 'pending',
      } as ApprovalRequest),
      approveRequest: vi.fn(),
      rejectRequest: vi.fn(),
      getPendingRequests: vi.fn().mockResolvedValue([]),
      getRequest: vi.fn(),
      waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
    };

    // Create mock rate limiter
    mockRateLimiter = {
      check: vi.fn().mockReturnValue({ allowed: true, remaining: 100 }),
      consume: vi.fn().mockReturnValue({ allowed: true, remaining: 99 }),
      configure: vi.fn(),
      reset: vi.fn(),
    };

    // Create mock audit service
    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockResolvedValue([]),
      getEventsByClient: vi.fn().mockResolvedValue([]),
    };

    // Bind dependencies
    container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);
    container.bind<IMcpClientFactory>(TYPES.McpClientFactory).toConstantValue(mockClientFactory);
    container.bind<IServerManager>(TYPES.ServerManager).toConstantValue(mockServerManager);
    container.bind<ITokenValidator>(TYPES.TokenValidator).toConstantValue(mockTokenValidator);
    container.bind<IPolicyEngine>(TYPES.PolicyEngine).toConstantValue(mockPolicyEngine);
    container.bind<IApprovalQueue>(TYPES.ApprovalQueue).toConstantValue(mockApprovalQueue);
    container.bind<IRateLimiter>(TYPES.RateLimiter).toConstantValue(mockRateLimiter);
    container.bind<IAuditService>(TYPES.AuditService).toConstantValue(mockAuditService);
    container.bind<IMcpAggregator>(TYPES.McpAggregator).to(McpAggregator);

    aggregator = container.get<IMcpAggregator>(TYPES.McpAggregator);
  });

  describe('callTool', () => {
    it('should successfully call a tool when authorized', async () => {
      const result = await aggregator.callTool(
        'mcpr_test-token',
        'test-server',
        'read_file',
        { path: '/test.txt' }
      );

      expect(result.result).toBeDefined();
      expect(mockTokenValidator.validateForServer).toHaveBeenCalled();
      expect(mockRateLimiter.consume).toHaveBeenCalled();
      expect(mockPolicyEngine.evaluate).toHaveBeenCalled();
      expect(mockClient.callTool).toHaveBeenCalledWith('read_file', { path: '/test.txt' });
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('should reject invalid tokens', async () => {
      vi.mocked(mockTokenValidator.validateForServer).mockResolvedValue({
        valid: false,
        error: 'Invalid token',
      });

      const result = await aggregator.callTool(
        'invalid-token',
        'test-server',
        'read_file',
        {}
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32001);
      expect(mockClient.callTool).not.toHaveBeenCalled();
    });

    it('should enforce rate limits', async () => {
      vi.mocked(mockRateLimiter.consume).mockReturnValue({
        allowed: false,
        remaining: 0,
        retryAfter: 1000,
      });

      const result = await aggregator.callTool(
        'token',
        'test-server',
        'read_file',
        {}
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32029);
      expect(result.error?.data?.retryAfter).toBe(1000);
    });

    it('should deny when policy denies', async () => {
      vi.mocked(mockPolicyEngine.evaluate).mockResolvedValue({
        action: 'deny',
        ruleId: 'deny-rule',
      } as PolicyDecision);

      const result = await aggregator.callTool(
        'token',
        'test-server',
        'dangerous_tool',
        {}
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32003);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          metadata: expect.objectContaining({ error: 'Denied by policy' }),
        })
      );
    });

    it('should require approval when policy requires it', async () => {
      vi.mocked(mockPolicyEngine.evaluate).mockResolvedValue({
        action: 'require_approval',
        ruleId: 'approval-rule',
      } as PolicyDecision);

      const result = await aggregator.callTool(
        'token',
        'test-server',
        'sensitive_tool',
        {}
      );

      expect(mockApprovalQueue.createRequest).toHaveBeenCalled();
      expect(mockApprovalQueue.waitForApproval).toHaveBeenCalled();
      expect(result.result).toBeDefined();
    });

    it('should reject when approval is denied', async () => {
      vi.mocked(mockPolicyEngine.evaluate).mockResolvedValue({
        action: 'require_approval',
        ruleId: 'approval-rule',
      } as PolicyDecision);
      vi.mocked(mockApprovalQueue.waitForApproval).mockResolvedValue({
        approved: false,
        reason: 'User rejected',
      });

      const result = await aggregator.callTool(
        'token',
        'test-server',
        'sensitive_tool',
        {}
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32004);
    });

    it('should handle approval timeout', async () => {
      vi.mocked(mockPolicyEngine.evaluate).mockResolvedValue({
        action: 'require_approval',
        ruleId: 'approval-rule',
      } as PolicyDecision);
      vi.mocked(mockApprovalQueue.waitForApproval).mockRejectedValue(
        new Error('Timeout')
      );

      const result = await aggregator.callTool(
        'token',
        'test-server',
        'sensitive_tool',
        {}
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32005);
    });

    it('should return error if server not found', async () => {
      vi.mocked(mockServerManager.getServer).mockReturnValue(null as any);

      const result = await aggregator.callTool(
        'token',
        'unknown-server',
        'read_file',
        {}
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32002);
    });
  });

  describe('listTools', () => {
    it('should aggregate tools from all running servers', async () => {
      const tools = await aggregator.listTools('mcpr_test-token');

      expect(tools.length).toBeGreaterThan(0);
      expect(mockServerManager.getRunningServers).toHaveBeenCalled();
    });

    it('should namespace tool names to prevent collisions', async () => {
      vi.mocked(mockClient.listTools).mockResolvedValue([
        { name: 'read_file', description: 'Read file', inputSchema: {} },
      ]);

      const tools = await aggregator.listTools('mcpr_test-token');

      // Tools should be namespaced like "server-id.tool-name"
      expect(tools.some((t) => t.name.includes('.'))).toBe(true);
    });
  });

  describe('listResources', () => {
    it('should list resources for a specific server', async () => {
      vi.mocked(mockClient.listResources).mockResolvedValue([
        { uri: 'file:///test.txt', name: 'test.txt', mimeType: 'text/plain' },
      ]);
      // Mock serverManager to get server and have it provide resources via client
      (mockServerManager as any).getServerResources = vi.fn().mockResolvedValue([
        { uri: 'file:///test.txt', name: 'test.txt', mimeType: 'text/plain' },
      ]);

      const resources = await aggregator.listResources('mcpr_test-token', 'test-server');

      expect(mockTokenValidator.validateForServer).toHaveBeenCalled();
    });
  });

  describe('listPrompts', () => {
    it('should list prompts for a specific server', async () => {
      vi.mocked(mockClient.listPrompts).mockResolvedValue([
        { name: 'code-review', description: 'Review code' },
      ]);
      // Mock serverManager to have it provide prompts via client
      (mockServerManager as any).getServerPrompts = vi.fn().mockResolvedValue([
        { name: 'code-review', description: 'Review code' },
      ]);

      const prompts = await aggregator.listPrompts('mcpr_test-token', 'test-server');

      expect(mockTokenValidator.validateForServer).toHaveBeenCalled();
    });
  });

  describe('readResource', () => {
    it('should read resource with proper authorization', async () => {
      vi.mocked(mockClient.readResource).mockResolvedValue([
        { uri: 'file:///test.txt', mimeType: 'text/plain', text: 'content' },
      ]);

      const result = await aggregator.readResource(
        'mcpr_test-token',
        'test-server',
        'file:///test.txt'
      );

      expect(result).toBeDefined();
      expect(mockTokenValidator.validateForServer).toHaveBeenCalled();
    });
  });
});
