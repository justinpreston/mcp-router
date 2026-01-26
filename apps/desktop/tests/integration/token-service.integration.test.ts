/**
 * Integration tests for TokenService
 * Tests token creation, validation, and management with real database
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container } from 'inversify';
import 'reflect-metadata';

import { TYPES } from '@main/core/types';
import type {
  ITokenService,
  ILogger,
  IDatabase,
  IConfig,
  Token,
} from '@main/core/interfaces';
import { TokenService } from '@main/services/auth/token.service';
import { TokenRepository } from '@main/repositories/token.repository';
import { SqliteDatabase } from '@main/services/core/database.service';
import { createMockLogger, createMockConfig } from '../utils';

describe('TokenService Integration', () => {
  let container: Container;
  let tokenService: ITokenService;
  let database: IDatabase;

  beforeEach(async () => {
    container = new Container();

    const mockLogger = createMockLogger();
    const mockConfig = createMockConfig();
    container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);
    container.bind<IConfig>(TYPES.Config).toConstantValue(mockConfig);

    // Create real database service with in-memory SQLite
    const dbService = new SqliteDatabase(mockConfig as any, mockLogger as any);
    (dbService as any).dbPath = ':memory:';
    dbService.initialize();
    database = dbService;
    container.bind<IDatabase>(TYPES.Database).toConstantValue(database);

    // Real repository
    const tokenRepo = new TokenRepository(database);
    container.bind(TYPES.TokenRepository).toConstantValue(tokenRepo);

    // Real token service
    container.bind<ITokenService>(TYPES.TokenService).to(TokenService);

    tokenService = container.get<ITokenService>(TYPES.TokenService);
  });

  afterEach(() => {
    if (database) {
      database.close();
    }
  });

  describe('Token Creation', () => {
    it('should create a token with required fields', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
        scopes: ['tools:read'],
      });

      expect(token).toBeDefined();
      expect(token.id).toBeDefined();
      expect(token.name).toBe('Test Token');
      expect(token.clientId).toBe('test-client');
      expect(token.scopes).toEqual(['tools:read']);
    });

    it('should generate unique token IDs', async () => {
      const token1 = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Token 1',
        scopes: ['tools:read'],
      });

      const token2 = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Token 2',
        scopes: ['tools:read'],
      });

      expect(token1.id).not.toBe(token2.id);
    });

    it('should create token with server access restrictions', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Restricted Token',
        scopes: ['tools:execute'],
        serverAccess: { 'server-1': true, 'server-2': false },
      });

      expect(token.serverAccess).toEqual({ 'server-1': true, 'server-2': false });
    });

    it('should create token with expiration (TTL)', async () => {
      const ttl = 3600; // 1 hour in seconds
      const before = Math.floor(Date.now() / 1000);

      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Expiring Token',
        scopes: ['tools:read'],
        ttl,
      });

      const after = Math.floor(Date.now() / 1000);

      expect(token.expiresAt).toBeDefined();
      expect(token.expiresAt).toBeGreaterThanOrEqual(before + ttl);
      expect(token.expiresAt).toBeLessThanOrEqual(after + ttl + 1);
    });
  });

  describe('Token Retrieval', () => {
    it('should list all tokens', async () => {
      await tokenService.generateToken({ clientId: 'client-1', name: 'Token 1', scopes: ['tools:read'] });
      await tokenService.generateToken({ clientId: 'client-2', name: 'Token 2', scopes: ['tools:execute'] });
      await tokenService.generateToken({ clientId: 'client-1', name: 'Token 3', scopes: ['resources:read'] });

      const tokens = await tokenService.listTokens();

      expect(tokens).toHaveLength(3);
    });

    it('should list tokens by client ID', async () => {
      await tokenService.generateToken({ clientId: 'client-1', name: 'Token 1', scopes: ['tools:read'] });
      await tokenService.generateToken({ clientId: 'client-2', name: 'Token 2', scopes: ['tools:execute'] });
      await tokenService.generateToken({ clientId: 'client-1', name: 'Token 3', scopes: ['resources:read'] });

      const tokens = await tokenService.listTokens('client-1');

      expect(tokens).toHaveLength(2);
      expect(tokens.every((t: Token) => t.clientId === 'client-1')).toBe(true);
    });
  });

  describe('Token Validation', () => {
    it('should validate a valid token', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Valid Token',
        scopes: ['tools:read', 'tools:execute'],
      });

      const result = await tokenService.validateToken(token.id);

      expect(result.valid).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token?.name).toBe('Valid Token');
    });

    it('should reject invalid token', async () => {
      const result = await tokenService.validateToken('invalid-token-id');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject expired token', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Expired Token',
        scopes: ['tools:read'],
        ttl: -1, // Already expired
      });

      const result = await tokenService.validateToken(token.id);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('Token Revocation', () => {
    it('should revoke a token', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Revoke Me',
        scopes: ['tools:read'],
      });

      await tokenService.revokeToken(token.id);

      // Token should no longer validate
      const result = await tokenService.validateToken(token.id);
      expect(result.valid).toBe(false);
    });

    it('should remove token from list after revocation', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Revoke Me',
        scopes: ['tools:read'],
      });

      await tokenService.revokeToken(token.id);

      const tokens = await tokenService.listTokens();
      const found = tokens.find((t: Token) => t.id === token.id);
      expect(found).toBeUndefined();
    });
  });

  describe('Server Access Update', () => {
    it('should update server access', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Server Test',
        scopes: ['tools:read'],
        serverAccess: { 'server-1': true },
      });

      const updated = await tokenService.updateServerAccess(token.id, {
        'server-1': true,
        'server-2': true,
        'server-3': false,
      });

      expect(updated.serverAccess).toEqual({
        'server-1': true,
        'server-2': true,
        'server-3': false,
      });
    });
  });

  describe('Token Timestamps', () => {
    it('should set timestamps on creation', async () => {
      const before = Math.floor(Date.now() / 1000);

      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Timestamp Test',
        scopes: ['tools:read'],
      });

      const after = Math.floor(Date.now() / 1000);

      expect(token.issuedAt).toBeGreaterThanOrEqual(before);
      expect(token.issuedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh a token', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Refresh Test',
        scopes: ['tools:read'],
        ttl: 3600,
      });

      const originalExpiry = token.expiresAt;

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 10));

      const refreshed = await tokenService.refreshToken(token.id);

      expect(refreshed.id).toBe(token.id);
      expect(refreshed.expiresAt).toBeGreaterThanOrEqual(originalExpiry);
    });
  });
});
