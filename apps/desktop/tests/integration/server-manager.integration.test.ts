/**
 * Integration tests for ServerManager
 * Tests the full flow from service through repository to database
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container } from 'inversify';
import 'reflect-metadata';

import { TYPES } from '@main/core/types';
import type {
  IServerManager,
  ILogger,
  IDatabase,
  IAuditService,
  MCPServer,
} from '@main/core/interfaces';
import { ServerManager } from '@main/services/server/server-manager.service';
import { ServerRepository } from '@main/repositories/server.repository';
import { SqliteDatabase } from '@main/services/core/database.service';
import { createMockLogger, createMockAuditService } from '../utils';

describe('ServerManager Integration', () => {
  let container: Container;
  let serverManager: IServerManager;
  let database: IDatabase;

  beforeEach(async () => {
    container = new Container();

    // Use in-memory database for tests
    const mockLogger = createMockLogger();
    container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);

    // Create real database service with in-memory SQLite
    const dbService = new SqliteDatabase(mockLogger as any, {} as any);
    // Override the path to use in-memory
    (dbService as any).dbPath = ':memory:';
    dbService.initialize();
    database = dbService;
    container.bind<IDatabase>(TYPES.Database).toConstantValue(database);

    // Real repository
    const serverRepo = new ServerRepository(database);
    container.bind(TYPES.ServerRepository).toConstantValue(serverRepo);

    // Mock audit service
    container.bind<IAuditService>(TYPES.AuditService).toConstantValue(createMockAuditService());

    // Real server manager
    container.bind<IServerManager>(TYPES.ServerManager).to(ServerManager);

    serverManager = container.get<IServerManager>(TYPES.ServerManager);
  });

  afterEach(() => {
    if (database) {
      database.close();
    }
  });

  describe('Server CRUD Operations', () => {
    it('should add a new stdio server', async () => {
      const server = await serverManager.addServer({
        name: 'Test Server',
        description: 'A test server',
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        toolPermissions: {},
      });

      expect(server).toBeDefined();
      expect(server.id).toBeDefined();
      expect(server.name).toBe('Test Server');
      expect(server.transport).toBe('stdio');
      expect(server.command).toBe('node');
      expect(server.status).toBe('stopped');
    });

    it('should add a new HTTP server', async () => {
      const server = await serverManager.addServer({
        name: 'HTTP Server',
        transport: 'http',
        command: '',
        args: [],
        url: 'http://localhost:3000/mcp',
        toolPermissions: {},
      });

      expect(server).toBeDefined();
      expect(server.transport).toBe('http');
      expect(server.url).toBe('http://localhost:3000/mcp');
    });

    it('should list all servers', async () => {
      await serverManager.addServer({
        name: 'Server 1',
        transport: 'stdio',
        command: 'node',
        args: [],
        toolPermissions: {},
      });

      await serverManager.addServer({
        name: 'Server 2',
        transport: 'http',
        command: '',
        args: [],
        url: 'http://localhost:3001',
        toolPermissions: {},
      });

      const servers = serverManager.getAllServers();

      expect(servers).toHaveLength(2);
      expect(servers.map((s: MCPServer) => s.name)).toContain('Server 1');
      expect(servers.map((s: MCPServer) => s.name)).toContain('Server 2');
    });

    it('should get a server by ID', async () => {
      const created = await serverManager.addServer({
        name: 'Find Me',
        transport: 'stdio',
        command: 'echo',
        args: [],
        toolPermissions: {},
      });

      const found = serverManager.getServer(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Find Me');
    });

    it('should return undefined for non-existent server', () => {
      const found = serverManager.getServer('non-existent-id');
      expect(found).toBeUndefined();
    });

    it('should update a server', async () => {
      const server = await serverManager.addServer({
        name: 'Original Name',
        transport: 'stdio',
        command: 'node',
        args: [],
        toolPermissions: {},
      });

      await serverManager.updateServer(server.id, {
        name: 'Updated Name',
        description: 'New description',
      });

      const updated = serverManager.getServer(server.id);

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.description).toBe('New description');
    });

    it('should delete a server', async () => {
      const server = await serverManager.addServer({
        name: 'Delete Me',
        transport: 'stdio',
        command: 'node',
        args: [],
        toolPermissions: {},
      });

      await serverManager.removeServer(server.id);

      const found = serverManager.getServer(server.id);
      expect(found).toBeUndefined();
    });

    it('should throw when deleting non-existent server', async () => {
      await expect(
        serverManager.removeServer('non-existent')
      ).rejects.toThrow('Server not found');
    });
  });

  describe('Server Status', () => {
    it('should have stopped status by default', async () => {
      const server = await serverManager.addServer({
        name: 'New Server',
        transport: 'stdio',
        command: 'node',
        args: [],
        toolPermissions: {},
      });

      expect(server.status).toBe('stopped');
    });

    it('should not allow updating status directly via updateServer', async () => {
      const server = await serverManager.addServer({
        name: 'Status Test',
        transport: 'stdio',
        command: 'node',
        args: [],
        toolPermissions: {},
      });

      // Attempt to update status (should be ignored)
      await serverManager.updateServer(server.id, {
        status: 'running',
      } as any);

      const updated = serverManager.getServer(server.id);
      expect(updated?.status).toBe('stopped');
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt on creation', async () => {
      const before = Date.now();

      const server = await serverManager.addServer({
        name: 'Timestamp Test',
        transport: 'stdio',
        command: 'node',
        args: [],
        toolPermissions: {},
      });

      const after = Date.now();

      expect(server.createdAt).toBeGreaterThanOrEqual(before);
      expect(server.createdAt).toBeLessThanOrEqual(after);
      expect(server.updatedAt).toBe(server.createdAt);
    });

    it('should update updatedAt on modification', async () => {
      const server = await serverManager.addServer({
        name: 'Update Test',
        transport: 'stdio',
        command: 'node',
        args: [],
        toolPermissions: {},
      });

      const originalUpdatedAt = server.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await serverManager.updateServer(server.id, {
        name: 'Updated',
      });

      const updated = serverManager.getServer(server.id);

      expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });
});
