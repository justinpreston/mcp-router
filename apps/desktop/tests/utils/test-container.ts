import 'reflect-metadata';
import { Container } from 'inversify';
import { vi } from 'vitest';
import Database from 'better-sqlite3';
import { TYPES } from '@main/core/types';
import type {
  IConfig,
  IDatabase,
  ILogger,
  IAuditService,
} from '@main/core/interfaces';

/**
 * Create a mock logger for testing.
 */
export function createMockLogger(): ILogger {
  const mockLogger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => mockLogger),
  };
  return mockLogger;
}

/**
 * Create a mock config for testing.
 */
export function createMockConfig(overrides: Record<string, unknown> = {}): IConfig {
  const config: Record<string, unknown> = {
    'http.port': 3282,
    'http.host': '127.0.0.1',
    'http.allowedOrigins': ['app://.'],
    'http.rateLimit.global': 100,
    'http.rateLimit.mcp': 60,
    'token.defaultTtl': 86400,
    'token.maxTtl': 2592000,
    'database.path': ':memory:',
    'log.level': 'debug',
    ...overrides,
  };

  return {
    get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined => {
      const value = config[key];
      return (value !== undefined ? value : defaultValue) as T | undefined;
    }),
    set: vi.fn(<T>(key: string, value: T): void => {
      config[key] = value;
    }),
    has: vi.fn((key: string): boolean => key in config),
    delete: vi.fn((key: string): void => {
      delete config[key];
    }),
    dataPath: '/tmp/mcp-router-test',
    isDevelopment: true,
  };
}

/**
 * Create an in-memory database for testing.
 */
export function createTestDatabase(): IDatabase {
  const db = new Database(':memory:');

  // Run schema migrations
  db.exec(`
    -- Tokens table
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      issued_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_used_at INTEGER,
      scopes TEXT NOT NULL,
      server_access TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_client_id ON tokens(client_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);

    -- Servers table
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '[]',
      env TEXT,
      transport TEXT NOT NULL DEFAULT 'stdio',
      status TEXT NOT NULL DEFAULT 'stopped',
      project_id TEXT,
      tool_permissions TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- Workspaces table
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      server_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- Policies table
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      scope TEXT NOT NULL,
      scope_id TEXT,
      resource_type TEXT NOT NULL,
      pattern TEXT NOT NULL,
      action TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      conditions TEXT,
      redact_fields TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_policies_scope ON policies(scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_policies_enabled ON policies(enabled);

    -- Memories table
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      tags TEXT NOT NULL DEFAULT '[]',
      embedding BLOB,
      source TEXT,
      metadata TEXT,
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_accessed_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);
    CREATE INDEX IF NOT EXISTS idx_memories_access ON memories(last_accessed_at);

    -- Audit events table
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      client_id TEXT,
      server_id TEXT,
      tool_name TEXT,
      success INTEGER NOT NULL,
      duration INTEGER,
      metadata TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(type);
    CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_events(client_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
  `);

  return {
    db,
    initialize: vi.fn(),
    close: vi.fn(() => db.close()),
    transaction: <T>(fn: () => T): T => {
      const transaction = db.transaction(fn);
      return transaction();
    },
  };
}

/**
 * Create a mock audit service for testing.
 */
export function createMockAuditService(): IAuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({
      totalEvents: 0,
      byType: {},
      successRate: 0,
      avgDuration: 0,
    }),
  };
}

/**
 * Create a test container with all dependencies mocked or using test implementations.
 */
export function createTestContainer(options: {
  useMockDatabase?: boolean;
  useMockAuditService?: boolean;
} = {}): Container {
  const container = new Container({
    defaultScope: 'Singleton',
    autoBindInjectable: false,
  });

  // Core infrastructure
  container.bind<ILogger>(TYPES.Logger).toConstantValue(createMockLogger());
  container.bind<IConfig>(TYPES.Config).toConstantValue(createMockConfig());

  if (options.useMockDatabase !== false) {
    container.bind<IDatabase>(TYPES.Database).toConstantValue(createTestDatabase());
  }

  if (options.useMockAuditService !== false) {
    container.bind<IAuditService>(TYPES.AuditService).toConstantValue(createMockAuditService());
  }

  return container;
}

/**
 * Helper to get a mock from the container.
 */
export function getMock<T>(container: Container, identifier: symbol): T {
  return container.get<T>(identifier);
}

/**
 * Helper to reset all mocks in the container.
 */
export function resetContainerMocks(container: Container): void {
  const logger = container.get<ILogger>(TYPES.Logger);
  vi.mocked(logger.debug).mockClear();
  vi.mocked(logger.info).mockClear();
  vi.mocked(logger.warn).mockClear();
  vi.mocked(logger.error).mockClear();

  if (container.isBound(TYPES.AuditService)) {
    const audit = container.get<IAuditService>(TYPES.AuditService);
    vi.mocked(audit.log).mockClear();
    vi.mocked(audit.query).mockClear();
    vi.mocked(audit.getStats).mockClear();
  }
}
