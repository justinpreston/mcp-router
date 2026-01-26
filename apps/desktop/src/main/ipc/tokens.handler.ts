import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { ITokenService, ILogger, Token } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import type { TokenInfo, TokenCreateOptions } from '@preload/api';

/**
 * Transform internal Token to API-safe TokenInfo.
 */
function toTokenInfo(token: Token): TokenInfo {
  return {
    id: token.id,
    clientId: token.clientId,
    name: token.name,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt,
    scopes: token.scopes,
    serverAccess: token.serverAccess,
  };
}

/**
 * Register IPC handlers for token management.
 */
export function registerTokenHandlers(container: Container): void {
  const tokenService = container.get<ITokenService>(TYPES.TokenService);
  const logger = container.get<ILogger>(TYPES.Logger);

  // List tokens
  ipcMain.handle('tokens:list', async (_event, clientId?: string) => {
    logger.debug('IPC: tokens:list', { clientId });

    const tokens = await tokenService.listTokens(clientId);
    return tokens.map(toTokenInfo);
  });

  // Create token
  ipcMain.handle('tokens:create', async (_event, options: TokenCreateOptions) => {
    logger.debug('IPC: tokens:create', { clientId: options?.clientId, name: options?.name });

    if (!options || typeof options !== 'object') {
      throw new Error('Invalid token options');
    }

    if (!options.clientId || typeof options.clientId !== 'string') {
      throw new Error('Client ID is required');
    }

    if (!options.name || typeof options.name !== 'string') {
      throw new Error('Token name is required');
    }

    const token = await tokenService.generateToken({
      clientId: options.clientId,
      name: options.name,
      ttl: options.ttl,
      scopes: options.scopes,
      serverAccess: options.serverAccess,
    });

    return toTokenInfo(token);
  });

  // Revoke token
  ipcMain.handle('tokens:revoke', async (_event, tokenId: string) => {
    logger.debug('IPC: tokens:revoke', { tokenId: tokenId?.substring(0, 8) + '...' });

    if (!tokenId || typeof tokenId !== 'string') {
      throw new Error('Invalid token ID');
    }

    await tokenService.revokeToken(tokenId);
  });

  // Update server access
  ipcMain.handle(
    'tokens:updateAccess',
    async (_event, tokenId: string, serverAccess: Record<string, boolean>) => {
      logger.debug('IPC: tokens:updateAccess', { tokenId: tokenId?.substring(0, 8) + '...' });

      if (!tokenId || typeof tokenId !== 'string') {
        throw new Error('Invalid token ID');
      }

      if (!serverAccess || typeof serverAccess !== 'object') {
        throw new Error('Invalid server access configuration');
      }

      const token = await tokenService.updateServerAccess(tokenId, serverAccess);
      return toTokenInfo(token);
    }
  );
}
