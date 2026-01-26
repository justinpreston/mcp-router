/**
 * CLI Configuration Management
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface CliConfig {
  defaultHost?: string;
  defaultPort?: number;
  token?: string;
}

const CONFIG_DIR = join(homedir(), '.mcp-router');
const CONFIG_FILE = join(CONFIG_DIR, 'cli-config.json');

/**
 * Get the configuration file path.
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Load CLI configuration from disk.
 */
export async function loadConfig(): Promise<CliConfig> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }

    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as CliConfig;
  } catch {
    return {};
  }
}

/**
 * Save CLI configuration to disk.
 */
export async function saveConfig(config: CliConfig): Promise<void> {
  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  // Write config file with restricted permissions
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * Merge new config with existing config.
 */
export async function mergeConfig(updates: Partial<CliConfig>): Promise<CliConfig> {
  const current = await loadConfig();
  const merged = { ...current, ...updates };
  await saveConfig(merged);
  return merged;
}
