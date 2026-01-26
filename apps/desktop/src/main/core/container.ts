import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from './types';
import type {
  IConfig,
  IDatabase,
  ILogger,
  ITokenService,
  ITokenValidator,
  ITokenRepository,
  IServerManager,
  IServerRepository,
  IWorkspaceService,
  IWorkspaceRepository,
  IProjectService,
  IProjectRepository,
  IWorkflowService,
  IWorkflowRepository,
  IWorkflowExecutionRepository,
  IWorkflowExecutor,
  IHookService,
  IHookRepository,
  IHookSandbox,
  ISkillsService,
  ISkillRepository,
  IPolicyEngine,
  IPolicyRepository,
  IApprovalQueue,
  IRateLimiter,
  IMemoryService,
  IMemoryRepository,
  IAuditService,
  IAuditRepository,
  IToolCatalog,
  IHttpServer,
  IMcpAggregator,
  IMcpClientFactory,
  IJsonRpcHandler,
  IStdioTransport,
  IHttpTransport,
  ISseTransport,
  IKeychainService,
  IProcessHealthMonitor,
  IDeepLinkHandler,
  ITrayService,
} from './interfaces';

// Import implementations (these will be created in subsequent files)
// Core
import { ConfigService } from '@main/services/core/config.service';
import { SqliteDatabase } from '@main/services/core/database.service';
import { Logger } from '@main/services/core/logger.service';

// Services
import { TokenService } from '@main/services/auth/token.service';
import { TokenValidator } from '@main/services/auth/token-validator.service';
import { ServerManager } from '@main/services/server/server-manager.service';
import { WorkspaceService } from '@main/services/workspace/workspace.service';
import { ProjectService } from '@main/services/project/project.service';
import { WorkflowService, WorkflowExecutor } from '@main/services/workflow';
import { HookService, HookSandbox } from '@main/services/hook';
import { SkillsService } from '@main/services/skills';
import { PolicyEngine } from '@main/services/policy/policy-engine.service';
import { ApprovalQueueService } from '@main/services/approval/approval-queue.service';
import { TokenBucketRateLimiter } from '@main/services/rate-limit/rate-limiter.service';
import { MemoryService } from '@main/services/memory/memory.service';
import { LocalEmbeddingProvider, type IEmbeddingProvider } from '@main/services/memory/embedding.provider';
import { AuditService } from '@main/services/audit/audit.service';
import { ToolCatalogService } from '@main/services/catalog/tool-catalog.service';
import { BM25SearchProvider, type ISearchProvider } from '@main/services/catalog/bm25-search.provider';
import { SecureHttpServer } from '@main/services/http/secure-http-server.service';
import { McpAggregator } from '@main/services/mcp/mcp-aggregator.service';
import { McpClientFactory } from '@main/services/mcp/mcp-client-factory';
import { JsonRpcHandler } from '@main/services/mcp/json-rpc-handler';
import { StdioTransport } from '@main/services/mcp/stdio-transport';
import { HttpTransport } from '@main/services/mcp/http-transport';
import { SseTransport } from '@main/services/mcp/sse-transport';
import { ProcessHealthMonitor } from '@main/services/mcp/process-health-monitor';
import { KeychainService } from '@main/services/auth/keychain.service';
import { DeepLinkHandler } from '@main/security/deep-link-handler';

// System Integration
import { TrayService } from '@main/services/tray/tray.service';
import { AutoUpdaterService, type IAutoUpdater } from '@main/services/updater';

// Repositories
import { TokenRepository } from '@main/repositories/token.repository';
import { ServerRepository } from '@main/repositories/server.repository';
import { WorkspaceRepository } from '@main/repositories/workspace.repository';
import { PolicyRepository } from '@main/repositories/policy.repository';
import { MemoryRepository } from '@main/repositories/memory.repository';
import { AuditRepository } from '@main/repositories/audit.repository';
import { ProjectRepository } from '@main/repositories/project.repository';
import { WorkflowRepository } from '@main/repositories/workflow.repository';
import { WorkflowExecutionRepository } from '@main/repositories/workflow-execution.repository';
import { HookRepository } from '@main/repositories/hook.repository';
import { SkillRepository } from '@main/repositories/skill.repository';

/**
 * Creates and configures the InversifyJS dependency injection container.
 * All services are bound as singletons by default.
 */
export function createContainer(): Container {
  const container = new Container({
    defaultScope: 'Singleton',
    autoBindInjectable: false,
  });

  // ============================================================================
  // Core Infrastructure (bind first, as other services depend on these)
  // ============================================================================
  container.bind<IConfig>(TYPES.Config).to(ConfigService);
  container.bind<IDatabase>(TYPES.Database).to(SqliteDatabase);
  container.bind<ILogger>(TYPES.Logger).to(Logger);

  // ============================================================================
  // Repositories (bind before services that depend on them)
  // ============================================================================
  container.bind<ITokenRepository>(TYPES.TokenRepository).to(TokenRepository);
  container.bind<IServerRepository>(TYPES.ServerRepository).to(ServerRepository);
  container.bind<IWorkspaceRepository>(TYPES.WorkspaceRepository).to(WorkspaceRepository);
  container.bind<IPolicyRepository>(TYPES.PolicyRepository).to(PolicyRepository);
  container.bind<IMemoryRepository>(TYPES.MemoryRepository).to(MemoryRepository);
  container.bind<IAuditRepository>(TYPES.AuditRepository).to(AuditRepository);
  container.bind<IProjectRepository>(TYPES.ProjectRepository).to(ProjectRepository);
  container.bind<IWorkflowRepository>(TYPES.WorkflowRepository).to(WorkflowRepository);
  container.bind<IWorkflowExecutionRepository>(TYPES.WorkflowExecutionRepository).to(WorkflowExecutionRepository);
  container.bind<IHookRepository>(TYPES.HookRepository).to(HookRepository);
  container.bind<ISkillRepository>(TYPES.SkillRepository).to(SkillRepository);

  // ============================================================================
  // Services
  // ============================================================================
  container.bind<ITokenService>(TYPES.TokenService).to(TokenService);
  container.bind<ITokenValidator>(TYPES.TokenValidator).to(TokenValidator);
  container.bind<IServerManager>(TYPES.ServerManager).to(ServerManager);
  container.bind<IWorkspaceService>(TYPES.WorkspaceService).to(WorkspaceService);
  container.bind<IProjectService>(TYPES.ProjectService).to(ProjectService);
  container.bind<IWorkflowExecutor>(TYPES.WorkflowExecutor).to(WorkflowExecutor);
  container.bind<IWorkflowService>(TYPES.WorkflowService).to(WorkflowService);
  container.bind<IHookSandbox>(TYPES.HookSandbox).to(HookSandbox);
  container.bind<IHookService>(TYPES.HookService).to(HookService);
  container.bind<ISkillsService>(TYPES.SkillsService).to(SkillsService);
  container.bind<IPolicyEngine>(TYPES.PolicyEngine).to(PolicyEngine);
  container.bind<IApprovalQueue>(TYPES.ApprovalQueue).to(ApprovalQueueService);
  container.bind<IRateLimiter>(TYPES.RateLimiter).to(TokenBucketRateLimiter);
  container.bind<IEmbeddingProvider>(TYPES.EmbeddingProvider).to(LocalEmbeddingProvider);
  container.bind<IMemoryService>(TYPES.MemoryService).to(MemoryService);
  container.bind<IAuditService>(TYPES.AuditService).to(AuditService);
  container.bind<ISearchProvider>(TYPES.BM25SearchProvider).to(BM25SearchProvider);
  container.bind<IToolCatalog>(TYPES.ToolCatalog).to(ToolCatalogService);

  // ============================================================================
  // HTTP & MCP Layer
  // ============================================================================
  container.bind<IHttpServer>(TYPES.HttpServer).to(SecureHttpServer);
  container.bind<IMcpAggregator>(TYPES.McpAggregator).to(McpAggregator);

  // ============================================================================
  // MCP Protocol Layer (JSON-RPC, Transports, Client)
  // ============================================================================
  container.bind<IMcpClientFactory>(TYPES.McpClientFactory).to(McpClientFactory);
  container.bind<IJsonRpcHandler>(TYPES.JsonRpcHandler).to(JsonRpcHandler);
  container.bind<IStdioTransport>(TYPES.StdioTransport).to(StdioTransport);
  container.bind<IHttpTransport>(TYPES.HttpTransport).to(HttpTransport);
  container.bind<ISseTransport>(TYPES.SseTransport).to(SseTransport);
  container.bind<IProcessHealthMonitor>(TYPES.ProcessHealthMonitor).to(ProcessHealthMonitor);
  container.bind<IKeychainService>(TYPES.KeychainService).to(KeychainService);

  // ============================================================================
  // Security
  // ============================================================================
  container.bind<IDeepLinkHandler>(TYPES.DeepLinkHandler).to(DeepLinkHandler);

  // ============================================================================
  // System Integration
  // ============================================================================
  container.bind<ITrayService>(TYPES.TrayService).to(TrayService);
  container.bind<IAutoUpdater>(TYPES.AutoUpdater).to(AutoUpdaterService);

  return container;
}

/**
 * Global container instance.
 * Initialize by calling initializeContainer() during app startup.
 */
let containerInstance: Container | null = null;

/**
 * Initializes the global container instance.
 * Should be called once during application startup.
 */
export function initializeContainer(): Container {
  if (containerInstance) {
    throw new Error('Container already initialized. Call disposeContainer() first.');
  }
  containerInstance = createContainer();
  return containerInstance;
}

/**
 * Returns the global container instance.
 * Throws if container hasn't been initialized.
 */
export function getContainer(): Container {
  if (!containerInstance) {
    throw new Error('Container not initialized. Call initializeContainer() first.');
  }
  return containerInstance;
}

/**
 * Disposes the global container instance.
 * Should be called during application shutdown.
 */
export async function disposeContainer(): Promise<void> {
  if (containerInstance) {
    // Dispose tray service
    try {
      const trayService = containerInstance.get<ITrayService>(TYPES.TrayService);
      await trayService.dispose();
    } catch {
      // Tray service may not have been initialized
    }

    // Close database connection
    const database = containerInstance.get<IDatabase>(TYPES.Database);
    database.close();

    // Stop HTTP server
    const httpServer = containerInstance.get<IHttpServer>(TYPES.HttpServer);
    if (httpServer.isRunning()) {
      await httpServer.stop();
    }

    containerInstance = null;
  }
}

/**
 * Helper to get a service from the container.
 * Syntactic sugar for container.get<T>(TYPES.ServiceName)
 */
export function getService<T>(serviceIdentifier: symbol): T {
  return getContainer().get<T>(serviceIdentifier);
}
