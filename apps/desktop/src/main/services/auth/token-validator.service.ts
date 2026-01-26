import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  ITokenValidator,
  ITokenService,
  ILogger,
  TokenValidationResult,
} from '@main/core/interfaces';

/**
 * Token validator service for authenticating requests.
 * Used by HTTP server and other components that need to validate tokens.
 */
@injectable()
export class TokenValidator implements ITokenValidator {
  constructor(
    @inject(TYPES.TokenService) private tokenService: ITokenService,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  /**
   * Validate a token.
   */
  async validate(tokenId: string): Promise<TokenValidationResult> {
    return this.tokenService.validateToken(tokenId);
  }

  /**
   * Validate a token for access to a specific server.
   */
  async validateForServer(
    tokenId: string,
    serverId: string
  ): Promise<TokenValidationResult> {
    const result = await this.tokenService.validateToken(tokenId);

    if (!result.valid || !result.token) {
      return result;
    }

    // Check server access permissions
    const serverAccess = result.token.serverAccess;

    // If serverAccess is empty, allow access to all servers (default permissive)
    if (Object.keys(serverAccess).length === 0) {
      return result;
    }

    // Check if server is explicitly allowed or denied
    if (serverAccess[serverId] === false) {
      this.logger.warn('Token denied access to server', {
        tokenId: this.redactTokenId(tokenId),
        serverId,
      });
      return {
        valid: false,
        error: 'Access to this server is not permitted',
      };
    }

    // Check for wildcard deny patterns
    for (const [pattern, allowed] of Object.entries(serverAccess)) {
      if (!allowed && this.matchesPattern(pattern, serverId)) {
        this.logger.warn('Token denied access to server via pattern', {
          tokenId: this.redactTokenId(tokenId),
          serverId,
          pattern,
        });
        return {
          valid: false,
          error: 'Access to this server is not permitted',
        };
      }
    }

    // If explicit permissions exist, check if server is explicitly allowed
    if (serverAccess[serverId] === true) {
      return result;
    }

    // Check for wildcard allow patterns
    for (const [pattern, allowed] of Object.entries(serverAccess)) {
      if (allowed && this.matchesPattern(pattern, serverId)) {
        return result;
      }
    }

    // If no explicit permission found and there are permissions defined,
    // default to deny (secure by default)
    this.logger.warn('Token has no explicit permission for server', {
      tokenId: this.redactTokenId(tokenId),
      serverId,
    });
    return {
      valid: false,
      error: 'Access to this server is not permitted',
    };
  }

  /**
   * Check if a server ID matches a pattern.
   * Supports * as wildcard.
   */
  private matchesPattern(pattern: string, serverId: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (!pattern.includes('*')) {
      return pattern === serverId;
    }

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(serverId);
  }

  /**
   * Redact token ID for safe logging.
   */
  private redactTokenId(tokenId: string): string {
    if (tokenId.length <= 12) {
      return '****';
    }
    return `${tokenId.slice(0, 5)}...${tokenId.slice(-4)}`;
  }
}
