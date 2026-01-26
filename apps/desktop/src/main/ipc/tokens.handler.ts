import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { ITokenService, ILogger, Token } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import type { TokenInfo } from '@preload/api';
import {
  TokenId,
  TokenCreateSchema,
  TokenUpdateAccessSchema,
  NonEmptyString,
  validateInput,
} from './validation-schemas';

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
  ipcMain.handle('tokens:list', async (_event, clientId?: unknown) => {
    const validClientId = clientId ? validateInput(NonEmptyString, clientId) : undefined;
    logger.debug('IPC: tokens:list', { clientId: validClientId });

    const tokens = await tokenService.listTokens(validClientId);
    return tokens.map(toTokenInfo);
  });

  // Create token
  ipcMain.handle('tokens:create', async (_event, options: unknown) => {
    const validOptions = validateInput(TokenCreateSchema, options);
    logger.debug('IPC: tokens:create', { clientId: validOptions.clientId, name: validOptions.name });

    const token = await tokenService.generateToken({
      clientId: validOptions.clientId,
      name: validOptions.name,
      ttl: validOptions.expiresInDays ? validOptions.expiresInDays * 24 * 60 * 60 : undefined,
      scopes: validOptions.scopes,
      serverAccess: validOptions.serverAccess?.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
    });

    return toTokenInfo(token);
  });

  // Revoke token
  ipcMain.handle('tokens:revoke', async (_event, tokenId: unknown) => {
    const validId = validateInput(TokenId, tokenId);
    logger.debug('IPC: tokens:revoke', { tokenId: validId.substring(0, 8) + '...' });

    await tokenService.revokeToken(validId);
  });

  // Update server access
  ipcMain.handle(
    'tokens:updateAccess',
    async (_event, tokenId: unknown, serverAccess: unknown) => {
      const validId = validateInput(TokenId, tokenId);
      const validAccess = validateInput(TokenUpdateAccessSchema.shape.serverAccess, serverAccess);
      logger.debug('IPC: tokens:updateAccess', { tokenId: validId.substring(0, 8) + '...' });

      const accessMap = validAccess.reduce((acc, id) => ({ ...acc, [id]: true }), {} as Record<string, boolean>);
      const token = await tokenService.updateServerAccess(validId, accessMap);
      return toTokenInfo(token);
    }
  );
}
