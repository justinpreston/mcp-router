import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  ITokenService,
  ITokenRepository,
  ILogger,
  IAuditService,
} from '@main/core/interfaces';
import { TokenService } from '../token.service';
import { TokenRepository } from '@main/repositories/token.repository';
import {
  createTestContainer,
  createMockToken,
  createExpiredToken,
} from '@tests/utils';

// Mock keytar module
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn().mockResolvedValue(undefined),
    getPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}));

import keytar from 'keytar';

describe('TokenService', () => {
  let container: Container;
  let tokenService: ITokenService;
  let mockLogger: ILogger;
  let mockAuditService: IAuditService;

  beforeEach(() => {
    // Create test container with real database
    container = createTestContainer();

    // Bind the token repository using the real implementation
    container.bind<ITokenRepository>(TYPES.TokenRepository).to(TokenRepository);

    // Bind the token service
    container.bind<ITokenService>(TYPES.TokenService).to(TokenService);

    // Get instances
    tokenService = container.get<ITokenService>(TYPES.TokenService);
    mockLogger = container.get<ILogger>(TYPES.Logger);
    mockAuditService = container.get<IAuditService>(TYPES.AuditService);

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a token with correct format', async () => {
      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
        scopes: ['default'],
      });

      expect(token.id).toMatch(/^mcpr_[A-Za-z0-9_-]{43}$/);
      expect(token.clientId).toBe('test-client');
      expect(token.name).toBe('Test Token');
      expect(token.scopes).toEqual(['default']);
    });

    it('should set correct expiration time with default TTL', async () => {
      const beforeTime = Math.floor(Date.now() / 1000);

      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
      });

      const afterTime = Math.floor(Date.now() / 1000);
      const expectedTtl = 24 * 60 * 60; // 24 hours

      // Expiration should be approximately issuedAt + 24 hours
      expect(token.expiresAt).toBeGreaterThanOrEqual(beforeTime + expectedTtl);
      expect(token.expiresAt).toBeLessThanOrEqual(afterTime + expectedTtl + 1);
    });

    it('should use custom TTL when provided', async () => {
      const customTtl = 3600; // 1 hour

      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
        ttl: customTtl,
      });

      expect(token.expiresAt - token.issuedAt).toBe(customTtl);
    });

    it('should cap TTL at maximum allowed value', async () => {
      const excessiveTtl = 365 * 24 * 60 * 60; // 1 year
      const maxTtl = 30 * 24 * 60 * 60; // 30 days

      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
        ttl: excessiveTtl,
      });

      expect(token.expiresAt - token.issuedAt).toBe(maxTtl);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Token TTL exceeds maximum, capping to 30 days',
        expect.any(Object)
      );
    });

    it('should store token in keychain', async () => {
      await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
      });

      expect(keytar.setPassword).toHaveBeenCalledWith(
        'mcp-router',
        expect.stringMatching(/^mcpr_/),
        expect.any(String)
      );
    });

    it('should log audit event on token creation', async () => {
      await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'token.create',
          clientId: 'test-client',
          success: true,
        })
      );
    });

    it('should set server access permissions when provided', async () => {
      const serverAccess = {
        'server-1': true,
        'server-2': false,
      };

      const token = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
        serverAccess,
      });

      expect(token.serverAccess).toEqual(serverAccess);
    });
  });

  describe('validateToken', () => {
    it('should return valid for unexpired token', async () => {
      const mockToken = createMockToken();

      // Mock keytar to return the token
      vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(mockToken));

      const result = await tokenService.validateToken(mockToken.id);

      expect(result.valid).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token?.id).toBe(mockToken.id);
    });

    it('should return invalid for expired token', async () => {
      const expiredToken = createExpiredToken();

      // Mock keytar to return the expired token
      vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(expiredToken));

      const result = await tokenService.validateToken(expiredToken.id);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should return invalid for non-existent token', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Use a properly formatted token ID (mcpr_ + 43 chars)
      const result = await tokenService.validateToken('mcpr_' + 'a'.repeat(43));

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token not found');
    });

    it('should return invalid for malformed token ID', async () => {
      const result = await tokenService.validateToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should revoke expired tokens automatically', async () => {
      const expiredToken = createExpiredToken();

      vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(expiredToken));

      await tokenService.validateToken(expiredToken.id);

      // Should have called deletePassword to revoke
      expect(keytar.deletePassword).toHaveBeenCalledWith('mcp-router', expiredToken.id);
    });

    it('should log audit event on validation', async () => {
      const mockToken = createMockToken();
      vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(mockToken));

      await tokenService.validateToken(mockToken.id);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'token.validate',
          success: true,
        })
      );
    });
  });

  describe('revokeToken', () => {
    it('should remove token from keychain', async () => {
      // First generate a token
      const generatedToken = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
      });

      await tokenService.revokeToken(generatedToken.id);

      expect(keytar.deletePassword).toHaveBeenCalledWith('mcp-router', generatedToken.id);
    });

    it('should log audit event on revocation', async () => {
      const generatedToken = await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
      });

      // Clear previous audit calls
      vi.mocked(mockAuditService.log).mockClear();

      await tokenService.revokeToken(generatedToken.id);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'token.revoke',
          success: true,
        })
      );
    });
  });

  describe('refreshToken', () => {
    it('should extend token expiration', async () => {
      const mockToken = createMockToken({
        issuedAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      });

      vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(mockToken));

      const refreshed = await tokenService.refreshToken(mockToken.id);

      // New expiration should be further in the future
      expect(refreshed.expiresAt).toBeGreaterThan(mockToken.expiresAt);
    });

    it('should throw error for expired token', async () => {
      const expiredToken = createExpiredToken();
      vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(expiredToken));

      await expect(tokenService.refreshToken(expiredToken.id)).rejects.toThrow(
        'Token expired'
      );
    });

    it('should throw error for invalid token', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Use a properly formatted token ID (mcpr_ + 43 chars)
      await expect(
        tokenService.refreshToken('mcpr_' + 'a'.repeat(43))
      ).rejects.toThrow('Token not found');
    });
  });

  describe('listTokens', () => {
    it('should return tokens for a specific client', async () => {
      const clientId = 'test-client-list';

      // Generate multiple tokens
      await tokenService.generateToken({
        clientId,
        name: 'Token 1',
      });
      await tokenService.generateToken({
        clientId,
        name: 'Token 2',
      });

      const tokens = await tokenService.listTokens(clientId);

      expect(tokens.length).toBe(2);
      expect(tokens.every(t => t.clientId === clientId)).toBe(true);
    });

    it('should return empty array when listing all tokens without clientId', async () => {
      // Generate a token
      await tokenService.generateToken({
        clientId: 'test-client',
        name: 'Test Token',
      });

      // Listing without clientId should return empty (security measure)
      const tokens = await tokenService.listTokens();

      expect(tokens).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to list all tokens without clientId filter'
      );
    });
  });

  describe('updateServerAccess', () => {
    it('should update server access permissions', async () => {
      const mockToken = createMockToken({
        serverAccess: { 'server-1': true },
      });

      vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(mockToken));

      const updated = await tokenService.updateServerAccess(mockToken.id, {
        'server-2': true,
        'server-3': false,
      });

      expect(updated.serverAccess).toEqual({
        'server-1': true,
        'server-2': true,
        'server-3': false,
      });
    });

    it('should throw error for invalid token', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      await expect(
        tokenService.updateServerAccess('mcpr_invalid' + 'a'.repeat(39), {})
      ).rejects.toThrow();
    });
  });
});
