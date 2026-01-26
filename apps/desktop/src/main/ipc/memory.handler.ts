import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type {
  IMemoryService,
  ILogger,
  Memory,
  MemorySearchResult,
  MemorySearchOptions,
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
}
