import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  MemoryInfo,
  MemorySearchResultInfo,
  MemoryStatistics,
  MemoryType,
  MemoryExportFilter,
  MemoryImportResult,
} from '../../preload/api';

/**
 * Memory store state interface.
 */
interface MemoryState {
  // Data
  memories: MemoryInfo[];
  searchResults: MemorySearchResultInfo[];
  statistics: MemoryStatistics | null;
  selectedMemory: MemoryInfo | null;

  // UI state
  isLoading: boolean;
  isSearching: boolean;
  isExporting: boolean;
  isImporting: boolean;
  isRegenerating: boolean;
  error: string | null;
  searchQuery: string;
  filterType: MemoryType | 'all';
  filterTags: string[];

  // Actions
  fetchMemories: (options?: { limit?: number; offset?: number }) => Promise<void>;
  fetchStatistics: () => Promise<void>;
  search: (query: string) => Promise<void>;
  searchSemantic: (query: string) => Promise<void>;
  searchHybrid: (query: string) => Promise<void>;
  searchByType: (type: MemoryType) => Promise<void>;
  storeMemory: (content: string, tags?: string[], type?: MemoryType, importance?: number) => Promise<MemoryInfo>;
  updateMemory: (id: string, updates: Partial<{ content: string; tags: string[]; type: MemoryType; importance: number }>) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  addTags: (id: string, tags: string[]) => Promise<void>;
  removeTags: (id: string, tags: string[]) => Promise<void>;
  bulkAddTags: (ids: string[], tags: string[]) => Promise<number>;
  bulkRemoveTags: (ids: string[], tags: string[]) => Promise<number>;
  exportMemories: (format: 'json' | 'markdown', filter?: MemoryExportFilter) => Promise<string>;
  importMemories: (data: string, format: 'json' | 'markdown') => Promise<MemoryImportResult>;
  regenerateEmbeddings: () => Promise<number>;
  selectMemory: (memory: MemoryInfo | null) => void;
  setFilterType: (type: MemoryType | 'all') => void;
  setFilterTags: (tags: string[]) => void;
  clearError: () => void;
}

/**
 * Memory store for managing memories and statistics.
 */
export const useMemoryStore = create<MemoryState>()(
  devtools(
    (set, get) => ({
      // Initial state
      memories: [],
      searchResults: [],
      statistics: null,
      selectedMemory: null,
      isLoading: false,
      isSearching: false,
      isExporting: false,
      isImporting: false,
      isRegenerating: false,
      error: null,
      searchQuery: '',
      filterType: 'all',
      filterTags: [],

      // Fetch all memories
      fetchMemories: async (options) => {
        set({ isLoading: true, error: null });
        try {
          const memories = await window.electron.memory.list(options);
          set({ memories, isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      // Fetch statistics
      fetchStatistics: async () => {
        set({ isLoading: true, error: null });
        try {
          const statistics = await window.electron.memory.getStatistics();
          set({ statistics, isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      // Text search
      search: async (query) => {
        set({ isSearching: true, error: null, searchQuery: query });
        try {
          const searchResults = await window.electron.memory.search(query);
          set({ searchResults, isSearching: false });
        } catch (error) {
          set({ error: String(error), isSearching: false });
        }
      },

      // Semantic search
      searchSemantic: async (query) => {
        set({ isSearching: true, error: null, searchQuery: query });
        try {
          const searchResults = await window.electron.memory.searchSemantic(query);
          set({ searchResults, isSearching: false });
        } catch (error) {
          set({ error: String(error), isSearching: false });
        }
      },

      // Hybrid search
      searchHybrid: async (query) => {
        set({ isSearching: true, error: null, searchQuery: query });
        try {
          const searchResults = await window.electron.memory.searchHybrid(query);
          set({ searchResults, isSearching: false });
        } catch (error) {
          set({ error: String(error), isSearching: false });
        }
      },

      // Search by type
      searchByType: async (type) => {
        set({ isSearching: true, error: null, filterType: type });
        try {
          const memories = await window.electron.memory.searchByType(type);
          set({ memories, isSearching: false });
        } catch (error) {
          set({ error: String(error), isSearching: false });
        }
      },

      // Store new memory
      storeMemory: async (content, tags, type, importance) => {
        set({ isLoading: true, error: null });
        try {
          const memory = await window.electron.memory.store({
            content,
            tags,
            type,
            importance,
          });
          // Refresh memories list
          const memories = await window.electron.memory.list();
          set({ memories, isLoading: false });
          return memory;
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      // Update memory
      updateMemory: async (id, updates) => {
        set({ isLoading: true, error: null });
        try {
          await window.electron.memory.update(id, updates);
          // Refresh memories list
          const memories = await window.electron.memory.list();
          set({ memories, isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      // Delete memory
      deleteMemory: async (id) => {
        set({ isLoading: true, error: null });
        try {
          await window.electron.memory.delete(id);
          // Refresh memories list
          const memories = await window.electron.memory.list();
          const { selectedMemory } = get();
          set({
            memories,
            isLoading: false,
            selectedMemory: selectedMemory?.id === id ? null : selectedMemory,
          });
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      // Add tags to memory
      addTags: async (id, tags) => {
        set({ isLoading: true, error: null });
        try {
          const updated = await window.electron.memory.addTags(id, tags);
          const memories = get().memories.map((m) =>
            m.id === id ? updated : m
          );
          set({ memories, isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      // Remove tags from memory
      removeTags: async (id, tags) => {
        set({ isLoading: true, error: null });
        try {
          const updated = await window.electron.memory.removeTags(id, tags);
          const memories = get().memories.map((m) =>
            m.id === id ? updated : m
          );
          set({ memories, isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      // Bulk add tags
      bulkAddTags: async (ids, tags) => {
        set({ isLoading: true, error: null });
        try {
          const count = await window.electron.memory.bulkAddTags(ids, tags);
          // Refresh memories list
          const memories = await window.electron.memory.list();
          set({ memories, isLoading: false });
          return count;
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      // Bulk remove tags
      bulkRemoveTags: async (ids, tags) => {
        set({ isLoading: true, error: null });
        try {
          const count = await window.electron.memory.bulkRemoveTags(ids, tags);
          // Refresh memories list
          const memories = await window.electron.memory.list();
          set({ memories, isLoading: false });
          return count;
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      // Export memories
      exportMemories: async (format, filter) => {
        set({ isExporting: true, error: null });
        try {
          const data = await window.electron.memory.export(format, filter);
          set({ isExporting: false });
          return data;
        } catch (error) {
          set({ error: String(error), isExporting: false });
          throw error;
        }
      },

      // Import memories
      importMemories: async (data, format) => {
        set({ isImporting: true, error: null });
        try {
          const result = await window.electron.memory.import(data, format);
          // Refresh memories and statistics after import
          const memories = await window.electron.memory.list();
          const statistics = await window.electron.memory.getStatistics();
          set({ memories, statistics, isImporting: false });
          return result;
        } catch (error) {
          set({ error: String(error), isImporting: false });
          throw error;
        }
      },

      // Regenerate embeddings
      regenerateEmbeddings: async () => {
        set({ isRegenerating: true, error: null });
        try {
          const count = await window.electron.memory.regenerateEmbeddings();
          set({ isRegenerating: false });
          return count;
        } catch (error) {
          set({ error: String(error), isRegenerating: false });
          throw error;
        }
      },

      // Select memory
      selectMemory: (memory) => {
        set({ selectedMemory: memory });
      },

      // Set filter type
      setFilterType: (type) => {
        set({ filterType: type });
      },

      // Set filter tags
      setFilterTags: (tags) => {
        set({ filterTags: tags });
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'memory-store' }
  )
);
