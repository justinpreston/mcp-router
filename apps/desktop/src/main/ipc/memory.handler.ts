import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type {
  IMemoryService,
  ILogger,
  Memory,
  MemoryInput,
  MemorySearchOptions,
  MemorySearchResult,
} from '@main/core/interfaces';
import { TYPES } from '@main/core/types';

/**
 * API-safe memory info type.
 */
export interface MemoryInfo {
  id: string;
  content: string;
  tags: string[];
  source?: string;
  metadata?: Record<string, unknown>;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

/**
 * API-safe memory search result type.
 */
export interface MemorySearchResultInfo {
  memory: MemoryInfo;
  score: number;
}

/**
 * Transform internal Memory to API-safe MemoryInfo.
 */
function toMemoryInfo(memory: Memory): MemoryInfo {
  return {
    id: memory.id,
    content: memory.content,
    tags: memory.tags,
    source: memory.source,
    metadata: memory.metadata,
    accessCount: memory.accessCount,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    lastAccessedAt: memory.lastAccessedAt,
  };
}

/**
 * Transform search result to API-safe format.
 */
function toSearchResultInfo(result: MemorySearchResult): MemorySearchResultInfo {
  return {
    memory: toMemoryInfo(result.memory),
    score: result.score,
  };
}

/**
 * Register IPC handlers for memory management.
 */
export function registerMemoryHandlers(container: Container): void {
  const memoryService = container.get<IMemoryService>(TYPES.MemoryService);
  const logger = container.get<ILogger>(TYPES.Logger);

  // Store new memory
  ipcMain.handle('memory:store', async (_event, input: MemoryInput) => {
    logger.debug('IPC: memory:store', { tags: input?.tags });

    if (!input || typeof input !== 'object') {
      throw new Error('Invalid memory input');
    }

    if (!input.content || typeof input.content !== 'string') {
      throw new Error('Memory content is required');
    }

    const memory = await memoryService.store({
      content: input.content,
      tags: Array.isArray(input.tags) ? input.tags : undefined,
      source: typeof input.source === 'string' ? input.source : undefined,
      metadata: input.metadata,
    });

    return toMemoryInfo(memory);
  });

  // Retrieve memory by ID
  ipcMain.handle('memory:get', async (_event, id: string) => {
    logger.debug('IPC: memory:get', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid memory ID');
    }

    const memory = await memoryService.retrieve(id);
    return memory ? toMemoryInfo(memory) : null;
  });

  // Search memories by query
  ipcMain.handle(
    'memory:search',
    async (_event, query: string, options?: MemorySearchOptions) => {
      logger.debug('IPC: memory:search', { query, options });

      if (!query || typeof query !== 'string') {
        throw new Error('Search query is required');
      }

      const results = await memoryService.search(query, options);
      return results.map(toSearchResultInfo);
    }
  );

  // Search memories by tags
  ipcMain.handle(
    'memory:searchByTags',
    async (_event, tags: string[], options?: MemorySearchOptions) => {
      logger.debug('IPC: memory:searchByTags', { tags, options });

      if (!Array.isArray(tags) || tags.length === 0) {
        throw new Error('At least one tag is required');
      }

      const memories = await memoryService.searchByTags(tags, options);
      return memories.map(toMemoryInfo);
    }
  );

  // List all memories with pagination
  ipcMain.handle(
    'memory:list',
    async (_event, options?: { limit?: number; offset?: number }) => {
      logger.debug('IPC: memory:list', { options });

      const memories = await memoryService.getAll(options);
      return memories.map(toMemoryInfo);
    }
  );

  // Update memory
  ipcMain.handle(
    'memory:update',
    async (_event, id: string, updates: Partial<MemoryInput>) => {
      logger.debug('IPC: memory:update', { id });

      if (!id || typeof id !== 'string') {
        throw new Error('Invalid memory ID');
      }

      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid update data');
      }

      const memory = await memoryService.update(id, updates);
      return toMemoryInfo(memory);
    }
  );

  // Delete memory
  ipcMain.handle('memory:delete', async (_event, id: string) => {
    logger.debug('IPC: memory:delete', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid memory ID');
    }

    await memoryService.delete(id);
  });
}
