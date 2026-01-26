import { injectable, inject } from 'inversify';
import * as crypto from 'crypto';
import keytar from 'keytar';
import { TYPES } from '@main/core/types';
import type {
  ITokenService,
  ITokenRepository,
  ILogger,
  IAuditService,
  Token,
  TokenGenerateOptions,
  TokenValidationResult,
} from '@main/core/interfaces';

const KEYTAR_SERVICE = 'mcp-router';
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Token service with secure storage and expiration.
 * Fixes CRITICAL-2 (token expiration) and CRITICAL-5 (plaintext storage).
 *
 * Token IDs are stored in SQLite for metadata queries.
 * Actual token secrets are stored in OS keychain via keytar.
 */
@injectable()
export class TokenService implements ITokenService {
  constructor(
    @inject(TYPES.TokenRepository) private tokenRepo: ITokenRepository,
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.AuditService) private auditService: IAuditService
  ) {}

  /**
   * Generate a new token with expiration.
   */
  async generateToken(options: TokenGenerateOptions): Promise<Token> {
    const now = Math.floor(Date.now() / 1000);

    // Validate and cap TTL
    let ttl = options.ttl ?? DEFAULT_TTL_SECONDS;
    if (ttl > MAX_TTL_SECONDS) {
      this.logger.warn('Token TTL exceeds maximum, capping to 30 days', {
        requested: ttl,
        capped: MAX_TTL_SECONDS,
      });
      ttl = MAX_TTL_SECONDS;
    }

    // Generate cryptographically secure token ID
    const tokenId = this.generateSecureTokenId();

    const token: Token = {
      id: tokenId,
      clientId: options.clientId,
      name: options.name,
      issuedAt: now,
      expiresAt: now + ttl,
      scopes: options.scopes ?? ['default'],
      serverAccess: options.serverAccess ?? {},
    };

    // Store token metadata in database
    await this.tokenRepo.create(token);

    // Store token secret in OS keychain (CRITICAL-5 fix)
    await this.storeTokenSecret(tokenId, token);

    // Audit log
    await this.auditService.log({
      type: 'token.create',
      clientId: options.clientId,
      success: true,
      metadata: {
        tokenId: this.redactTokenId(tokenId),
        name: options.name,
        expiresAt: token.expiresAt,
        scopes: token.scopes,
      },
    });

    this.logger.info('Token generated', {
      tokenId: this.redactTokenId(tokenId),
      clientId: options.clientId,
      expiresIn: ttl,
    });

    return token;
  }

  /**
   * Validate a token and check expiration.
   */
  async validateToken(tokenId: string): Promise<TokenValidationResult> {
    // Basic format validation
    if (!this.isValidTokenFormat(tokenId)) {
      return { valid: false, error: 'Invalid token format' };
    }

    try {
      // Retrieve from keychain
      const storedToken = await this.getTokenSecret(tokenId);

      if (!storedToken) {
        await this.auditService.log({
          type: 'token.validate',
          success: false,
          metadata: { error: 'Token not found' },
        });
        return { valid: false, error: 'Token not found' };
      }

      // Check expiration (CRITICAL-2 fix)
      const now = Math.floor(Date.now() / 1000);
      if (storedToken.expiresAt < now) {
        // Revoke expired token
        await this.revokeToken(tokenId);

        await this.auditService.log({
          type: 'token.validate',
          clientId: storedToken.clientId,
          success: false,
          metadata: { error: 'Token expired' },
        });

        return { valid: false, error: 'Token expired' };
      }

      // Update last used timestamp
      storedToken.lastUsedAt = now;
      await this.tokenRepo.update(storedToken);

      await this.auditService.log({
        type: 'token.validate',
        clientId: storedToken.clientId,
        success: true,
      });

      return { valid: true, token: storedToken };
    } catch (error) {
      this.logger.error('Token validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { valid: false, error: 'Validation error' };
    }
  }

  /**
   * Revoke a token.
   */
  async revokeToken(tokenId: string): Promise<void> {
    try {
      // Get token info for audit before deletion
      const token = await this.tokenRepo.findById(tokenId);

      // Remove from keychain
      await keytar.deletePassword(KEYTAR_SERVICE, tokenId);

      // Remove from database
      await this.tokenRepo.delete(tokenId);

      await this.auditService.log({
        type: 'token.revoke',
        clientId: token?.clientId,
        success: true,
        metadata: { tokenId: this.redactTokenId(tokenId) },
      });

      this.logger.info('Token revoked', {
        tokenId: this.redactTokenId(tokenId),
      });
    } catch (error) {
      this.logger.error('Token revocation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Refresh a token, extending its expiration.
   */
  async refreshToken(tokenId: string): Promise<Token> {
    const validation = await this.validateToken(tokenId);

    if (!validation.valid || !validation.token) {
      throw new Error(validation.error || 'Cannot refresh invalid token');
    }

    const token = validation.token;
    const now = Math.floor(Date.now() / 1000);

    // Calculate new expiration based on original TTL
    const originalTtl = token.expiresAt - token.issuedAt;
    token.expiresAt = now + originalTtl;

    // Update in keychain and database
    await this.storeTokenSecret(tokenId, token);
    await this.tokenRepo.update(token);

    this.logger.info('Token refreshed', {
      tokenId: this.redactTokenId(tokenId),
      newExpiresAt: token.expiresAt,
    });

    return token;
  }

  /**
   * List all tokens for a client.
   */
  async listTokens(clientId?: string): Promise<Token[]> {
    if (clientId) {
      return this.tokenRepo.findByClientId(clientId);
    }

    // For security, don't allow listing all tokens without clientId filter
    this.logger.warn('Attempted to list all tokens without clientId filter');
    return [];
  }

  /**
   * Update server access permissions for a token.
   */
  async updateServerAccess(
    tokenId: string,
    serverAccess: Record<string, boolean>
  ): Promise<Token> {
    const validation = await this.validateToken(tokenId);

    if (!validation.valid || !validation.token) {
      throw new Error(validation.error || 'Invalid token');
    }

    const token = validation.token;
    token.serverAccess = { ...token.serverAccess, ...serverAccess };

    // Update in keychain and database
    await this.storeTokenSecret(tokenId, token);
    await this.tokenRepo.update(token);

    this.logger.info('Token server access updated', {
      tokenId: this.redactTokenId(tokenId),
      serverAccess: Object.keys(serverAccess),
    });

    return token;
  }

  /**
   * Clean up expired tokens.
   * Should be called periodically (e.g., on app startup and via scheduled task).
   */
  async cleanupExpiredTokens(): Promise<number> {
    const deletedCount = await this.tokenRepo.deleteExpired();

    if (deletedCount > 0) {
      this.logger.info('Cleaned up expired tokens', { count: deletedCount });
    }

    return deletedCount;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Generate a cryptographically secure token ID.
   * Format: mcpr_<32 bytes base64url>
   */
  private generateSecureTokenId(): string {
    const randomBytes = crypto.randomBytes(32);
    const base64url = randomBytes
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return `mcpr_${base64url}`;
  }

  /**
   * Validate token ID format.
   */
  private isValidTokenFormat(tokenId: string): boolean {
    // Must start with mcpr_ and have valid base64url characters
    return /^mcpr_[A-Za-z0-9_-]{43}$/.test(tokenId);
  }

  /**
   * Store token in OS keychain.
   */
  private async storeTokenSecret(tokenId: string, token: Token): Promise<void> {
    const serialized = JSON.stringify(token);
    await keytar.setPassword(KEYTAR_SERVICE, tokenId, serialized);
  }

  /**
   * Retrieve token from OS keychain.
   */
  private async getTokenSecret(tokenId: string): Promise<Token | null> {
    const serialized = await keytar.getPassword(KEYTAR_SERVICE, tokenId);

    if (!serialized) {
      return null;
    }

    try {
      return JSON.parse(serialized) as Token;
    } catch {
      this.logger.error('Failed to parse token from keychain', {
        tokenId: this.redactTokenId(tokenId),
      });
      return null;
    }
  }

  /**
   * Redact token ID for safe logging.
   * Shows prefix and last 4 characters only.
   */
  private redactTokenId(tokenId: string): string {
    if (tokenId.length <= 12) {
      return '****';
    }
    return `${tokenId.slice(0, 5)}...${tokenId.slice(-4)}`;
  }
}
