import type { RiskLevel } from '@main/core/interfaces';
import { RISK_PATTERNS } from '@main/core/interfaces';

/**
 * Classify a tool by risk level based on its name.
 * Uses regex pattern matching against known dangerous/write/exec patterns.
 *
 * Risk levels:
 * - exec: tools that run arbitrary code (shell, exec, spawn, etc.)
 * - write: tools that modify state (create, delete, write, send, etc.)
 * - read: everything else (list, get, read, search, etc.)
 */
export function classifyToolRisk(toolName: string): RiskLevel {
  if (RISK_PATTERNS.exec.test(toolName)) return 'exec';
  if (RISK_PATTERNS.write.test(toolName)) return 'write';
  return 'read';
}

/**
 * Generate a standardized exposed tool name from server slug and raw tool name.
 * Format: `serverslug__toolname`
 *
 * @example generateExposedToolName('My Server', 'read_file') → 'my_server__read_file'
 */
export function generateExposedToolName(serverName: string, toolNameRaw: string): string {
  const slug = serverName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${slug}__${toolNameRaw}`;
}

/**
 * Parse an exposed tool name back into server slug and raw tool name.
 *
 * @example parseExposedToolName('my_server__read_file') → { serverSlug: 'my_server', toolNameRaw: 'read_file' }
 */
export function parseExposedToolName(
  exposedName: string
): { serverSlug: string; toolNameRaw: string } | null {
  const match = exposedName.match(/^([a-z0-9_]+)__(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { serverSlug: match[1], toolNameRaw: match[2] };
}
