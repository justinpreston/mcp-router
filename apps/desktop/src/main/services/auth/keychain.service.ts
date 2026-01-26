import { injectable, inject } from 'inversify';
import keytar from 'keytar';
import { TYPES } from '@main/core/types';
import type { ILogger, IKeychainService } from '@main/core/interfaces';

const SERVICE_NAME = 'mcp-router';

/**
 * Keychain service for secure credential storage using the OS keychain.
 * Uses keytar to access macOS Keychain, Windows Credential Store, or Linux libsecret.
 */
@injectable()
export class KeychainService implements IKeychainService {
  private available: boolean | null = null;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Store a secret in the OS keychain.
   */
  async setSecret(key: string, value: string): Promise<void> {
    try {
      await keytar.setPassword(SERVICE_NAME, key, value);
      this.logger.debug('Stored secret in keychain', { key });
    } catch (error) {
      this.logger.error('Failed to store secret in keychain', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to store secret: ${key}`);
    }
  }

  /**
   * Retrieve a secret from the OS keychain.
   */
  async getSecret(key: string): Promise<string | null> {
    try {
      const value = await keytar.getPassword(SERVICE_NAME, key);
      this.logger.debug('Retrieved secret from keychain', {
        key,
        found: value !== null,
      });
      return value;
    } catch (error) {
      this.logger.error('Failed to retrieve secret from keychain', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Delete a secret from the OS keychain.
   */
  async deleteSecret(key: string): Promise<boolean> {
    try {
      const result = await keytar.deletePassword(SERVICE_NAME, key);
      this.logger.debug('Deleted secret from keychain', { key, deleted: result });
      return result;
    } catch (error) {
      this.logger.error('Failed to delete secret from keychain', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Check if keychain storage is available on this system.
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    try {
      // Test keychain availability by attempting a get operation
      const testKey = '__mcp_router_keychain_test__';
      await keytar.getPassword(SERVICE_NAME, testKey);
      this.available = true;
      this.logger.info('Keychain storage is available');
    } catch (error) {
      this.available = false;
      this.logger.warn('Keychain storage is not available', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return this.available;
  }

  /**
   * Store a token with its hash as the key.
   * Useful for storing the actual token value indexed by its hash.
   */
  async storeToken(tokenHash: string, tokenValue: string): Promise<void> {
    const key = `token:${tokenHash}`;
    await this.setSecret(key, tokenValue);
  }

  /**
   * Retrieve a token by its hash.
   */
  async getToken(tokenHash: string): Promise<string | null> {
    const key = `token:${tokenHash}`;
    return this.getSecret(key);
  }

  /**
   * Delete a token by its hash.
   */
  async deleteToken(tokenHash: string): Promise<boolean> {
    const key = `token:${tokenHash}`;
    return this.deleteSecret(key);
  }

  /**
   * Store server credentials (e.g., API keys for remote MCP servers).
   */
  async storeServerCredential(
    serverId: string,
    credentialType: string,
    value: string
  ): Promise<void> {
    const key = `server:${serverId}:${credentialType}`;
    await this.setSecret(key, value);
  }

  /**
   * Retrieve server credentials.
   */
  async getServerCredential(
    serverId: string,
    credentialType: string
  ): Promise<string | null> {
    const key = `server:${serverId}:${credentialType}`;
    return this.getSecret(key);
  }

  /**
   * Delete server credentials.
   */
  async deleteServerCredential(
    serverId: string,
    credentialType: string
  ): Promise<boolean> {
    const key = `server:${serverId}:${credentialType}`;
    return this.deleteSecret(key);
  }

  /**
   * List all credentials for a server.
   * Note: keytar doesn't support listing, so this returns an empty array.
   * Would need to track stored keys separately for full implementation.
   */
  async listServerCredentials(_serverId: string): Promise<string[]> {
    // keytar doesn't support listing credentials
    // A full implementation would track stored keys in a separate database
    this.logger.debug('listServerCredentials not fully implemented - keytar limitation');
    return [];
  }
}
