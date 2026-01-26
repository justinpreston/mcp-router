import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type {
  IMemoryService,
  ILogger,
  Memory,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryType,
} from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import {
  MemoryIdSchema,
  MemoryStoreSchema,
  MemoryUpdateInputSchema,
  NonEmptyString,
  validateInput,
} from './validation-schemas';
import { z } from 'zod';

/**
 * API-safe memory info type.
 */
export interface MemoryInfo {
  id: string;
  content: string;
  tags: string[];
  type: MemoryType;
  importance: number;
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
    type: memory.type,
    importance: memory.importance,
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

// Schema for tags array
const TagsArraySchema = z.array(z.string().max(50)).min(1).max(50);

// Schema for search options matching MemorySearchOptions interface
const SearchOptionsSchema = z.object({
  tags: z.array(z.string().max(50)).max(50).optional(),
  minScore: z.number().min(0).max(1).optional(),
  topK: z.number().int().min(1).max(100).optional(),
  includeEmbeddings: z.boolean().optional(),
}).optional();

// Schema for list options
const ListOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();

/**
 * Register IPC handlers for memory management.
 */
export function registerMemoryHandlers(container: Container): void {
  const memoryService = container.get<IMemoryService>(TYPES.MemoryService);
  const logger = container.get<ILogger>(TYPES.Logger);

  // Store new memory
  ipcMain.handle('memory:store', async (_event, input: unknown) => {
    logger.debug('IPC: memory:store');

    const validInput = validateInput(MemoryStoreSchema, input);

    const memory = await memoryService.store({
      content: validInput.content,
      tags: validInput.tags,
      source: validInput.source,
      metadata: validInput.metadata,
    });

    return toMemoryInfo(memory);
  });

  // Retrieve memory by ID
  ipcMain.handle('memory:get', async (_event, id: unknown) => {
    logger.debug('IPC: memory:get', { id });

    const validId = validateInput(MemoryIdSchema, id);
    const memory = await memoryService.retrieve(validId);
    return memory ? toMemoryInfo(memory) : null;
  });

  // Search memories by query
  ipcMain.handle(
    'memory:search',
    async (_event, query: unknown, options?: unknown) => {
      logger.debug('IPC: memory:search', { query });

      const validQuery = validateInput(NonEmptyString.max(500), query);
      const validOptions = options ? validateInput(SearchOptionsSchema, options) : undefined;

      const results = await memoryService.search(validQuery, validOptions as MemorySearchOptions);
      return results.map(toSearchResultInfo);
    }
  );

  // Search memories by tags
  ipcMain.handle(
    'memory:searchByTags',
    async (_event, tags: unknown, options?: unknown) => {
      logger.debug('IPC: memory:searchByTags', { tags });

      const validTags = validateInput(TagsArraySchema, tags);
      const validOptions = options ? validateInput(SearchOptionsSchema, options) : undefined;

      const memories = await memoryService.searchByTags(validTags, validOptions as MemorySearchOptions);
      return memories.map(toMemoryInfo);
    }
  );

  // List all memories with pagination
  ipcMain.handle(
    'memory:list',
    async (_event, options?: unknown) => {
      logger.debug('IPC: memory:list', { options });

      const validOptions = options ? validateInput(ListOptionsSchema, options) : undefined;
      const memories = await memoryService.getAll(validOptions);
      return memories.map(toMemoryInfo);
    }
  );

  // Update memory
  ipcMain.handle(
    'memory:update',
    async (_event, id: unknown, updates: unknown) => {
      logger.debug('IPC: memory:update', { id });

      const validId = validateInput(MemoryIdSchema, id);
      const validUpdates = validateInput(MemoryUpdateInputSchema, updates);

      const memory = await memoryService.update(validId, validUpdates);
      return toMemoryInfo(memory);
    }
  );

  // Delete memory
  ipcMain.handle('memory:delete', async (_event, id: unknown) => {
    logger.debug('IPC: memory:delete', { id });

    const validId = validateInput(MemoryIdSchema, id);
    await memoryService.delete(validId);
  });

  // Get memory statistics
  ipcMain.handle('memory:getStatistics', async () => {
    logger.debug('IPC: memory:getStatistics');
    const stats = await memoryService.getStatistics();
    // Map the internal statistics to API format
    return {
      totalCount: stats.total,
      byType: stats.byType,
      byTag: stats.byTag,
      avgImportance: stats.averageImportance,
      avgAccessCount: stats.averageAccessCount,
      totalAccessCount: Math.round(stats.averageAccessCount * stats.total),
      recentlyAccessed: stats.recentlyAccessed,
      oldestMemory: undefined, // Not available in current stats
      newestMemory: undefined, // Not available in current stats
    };
  });

  // Semantic search
  ipcMain.handle(
    'memory:searchSemantic',
    async (_event, query: unknown, options?: unknown) => {
      logger.debug('IPC: memory:searchSemantic', { query });

      const validQuery = validateInput(NonEmptyString.max(500), query);
      const validOptions = options ? validateInput(SearchOptionsSchema, options) : {};

      const results = await memoryService.searchSemantic({
        query: validQuery,
        limit: validOptions?.topK || 10,
        minSimilarity: validOptions?.minScore || 0.5,
      });
      return results.map(toSearchResultInfo);
    }
  );

  // Hybrid search
  ipcMain.handle(
    'memory:searchHybrid',
    async (_event, query: unknown, options?: unknown) => {
      logger.debug('IPC: memory:searchHybrid', { query });

      const validQuery = validateInput(NonEmptyString.max(500), query);
      const validOptions = options ? validateInput(SearchOptionsSchema, options) : {};

      const results = await memoryService.searchHybrid({
        query: validQuery,
        limit: validOptions?.topK || 10,
        minSimilarity: validOptions?.minScore || 0.3,
      });
      return results.map(toSearchResultInfo);
    }
  );

  // Search by type - implemented using repository directly
  ipcMain.handle(
    'memory:searchByType',
    async (_event, type: unknown, options?: unknown) => {
      logger.debug('IPC: memory:searchByType', { type });

      const validType = validateInput(z.enum(['note', 'conversation', 'code', 'document', 'task', 'reference']), type);
      const validOptions = options ? validateInput(ListOptionsSchema, options) : {};

      // Use getAll and filter by type since searchByType isn't on the service
      const allMemories = await memoryService.getAll(validOptions);
      const filtered = allMemories.filter(m => m.type === validType);
      return filtered.map(toMemoryInfo);
    }
  );

  // Add tags to memory - use update method
  ipcMain.handle(
    'memory:addTags',
    async (_event, id: unknown, tags: unknown) => {
      logger.debug('IPC: memory:addTags', { id, tags });

      const validId = validateInput(MemoryIdSchema, id);
      const validTags = validateInput(TagsArraySchema, tags);

      // Get current memory and add tags
      const memory = await memoryService.retrieve(validId);
      if (!memory) {
        throw new Error(`Memory not found: ${validId}`);
      }
      const newTags = [...new Set([...memory.tags, ...validTags])];
      const updated = await memoryService.update(validId, { tags: newTags });
      return toMemoryInfo(updated);
    }
  );

  // Remove tags from memory - use update method
  ipcMain.handle(
    'memory:removeTags',
    async (_event, id: unknown, tags: unknown) => {
      logger.debug('IPC: memory:removeTags', { id, tags });

      const validId = validateInput(MemoryIdSchema, id);
      const validTags = validateInput(TagsArraySchema, tags);

      // Get current memory and remove tags
      const memory = await memoryService.retrieve(validId);
      if (!memory) {
        throw new Error(`Memory not found: ${validId}`);
      }
      const tagsSet = new Set(validTags);
      const newTags = memory.tags.filter(t => !tagsSet.has(t));
      const updated = await memoryService.update(validId, { tags: newTags });
      return toMemoryInfo(updated);
    }
  );

  // Bulk add tags
  ipcMain.handle(
    'memory:bulkAddTags',
    async (_event, ids: unknown, tags: unknown) => {
      logger.debug('IPC: memory:bulkAddTags', { count: Array.isArray(ids) ? ids.length : 0 });

      const validIds = validateInput(z.array(MemoryIdSchema).min(1).max(100), ids);
      const validTags = validateInput(TagsArraySchema, tags);

      // Add each tag to all memories
      let totalModified = 0;
      for (const tag of validTags) {
        const modified = await memoryService.bulkAddTag(validIds, tag);
        totalModified += modified;
      }
      return totalModified;
    }
  );

  // Bulk remove tags
  ipcMain.handle(
    'memory:bulkRemoveTags',
    async (_event, ids: unknown, tags: unknown) => {
      logger.debug('IPC: memory:bulkRemoveTags', { count: Array.isArray(ids) ? ids.length : 0 });

      const validIds = validateInput(z.array(MemoryIdSchema).min(1).max(100), ids);
      const validTags = validateInput(TagsArraySchema, tags);

      // Remove each tag from all memories
      let totalModified = 0;
      for (const tag of validTags) {
        const modified = await memoryService.bulkRemoveTag(validIds, tag);
        totalModified += modified;
      }
      return totalModified;
    }
  );

  // Export memories
  ipcMain.handle(
    'memory:export',
    async (_event, format: unknown, filter?: unknown) => {
      logger.debug('IPC: memory:export', { format });

      const validFormat = validateInput(z.enum(['json', 'markdown']), format);
      const validFilter = filter ? validateInput(z.object({
        tags: z.array(z.string()).optional(),
        type: z.enum(['note', 'conversation', 'code', 'document', 'task', 'reference']).optional(),
        minImportance: z.number().min(0).max(1).optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
      }).optional(), filter) : undefined;

      return memoryService.exportMemories({
        format: validFormat as 'json' | 'markdown',
        types: validFilter?.type ? [validFilter.type as MemoryType] : undefined,
        tags: validFilter?.tags,
      });
    }
  );

  // Import memories
  ipcMain.handle(
    'memory:import',
    async (_event, data: unknown, format: unknown) => {
      logger.debug('IPC: memory:import', { format });

      const validFormat = validateInput(z.enum(['json', 'markdown']), format);
      const validData = validateInput(z.string().min(1).max(10_000_000), data); // 10MB max

      return memoryService.importMemories(validData, validFormat as 'json' | 'markdown');
    }
  );

  // Regenerate embeddings
  ipcMain.handle('memory:regenerateEmbeddings', async () => {
    logger.debug('IPC: memory:regenerateEmbeddings');
    const result = await memoryService.regenerateEmbeddings();
    return result.success;
  });
}
