import { useCallback } from 'react';
import { useElectron } from './useElectron';
import type {
  MemoryInfo,
  MemoryInput,
  MemorySearchOptions,
  MemorySearchResultInfo,
} from '@preload/api';

/**
 * Hook for memory management operations.
 */
export function useMemory() {
  const api = useElectron();

  const storeMemory = useCallback(
    async (input: MemoryInput): Promise<MemoryInfo> => {
      return api.memory.store(input);
    },
    [api]
  );

  const getMemory = useCallback(
    async (id: string): Promise<MemoryInfo | null> => {
      return api.memory.get(id);
    },
    [api]
  );

  const searchMemory = useCallback(
    async (query: string, options?: MemorySearchOptions): Promise<MemorySearchResultInfo[]> => {
      return api.memory.search(query, options);
    },
    [api]
  );

  const searchMemoryByTags = useCallback(
    async (tags: string[], options?: MemorySearchOptions): Promise<MemoryInfo[]> => {
      return api.memory.searchByTags(tags, options);
    },
    [api]
  );

  const listMemories = useCallback(
    async (options?: { limit?: number; offset?: number }): Promise<MemoryInfo[]> => {
      return api.memory.list(options);
    },
    [api]
  );

  const updateMemory = useCallback(
    async (id: string, updates: Partial<MemoryInput>): Promise<MemoryInfo> => {
      return api.memory.update(id, updates);
    },
    [api]
  );

  const deleteMemory = useCallback(
    async (id: string): Promise<void> => {
      return api.memory.delete(id);
    },
    [api]
  );

  return {
    storeMemory,
    getMemory,
    searchMemory,
    searchMemoryByTags,
    listMemories,
    updateMemory,
    deleteMemory,
  };
}
