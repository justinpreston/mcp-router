import { injectable, inject } from 'inversify';
import * as crypto from 'crypto';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IMemoryService,
  IMemoryRepository,
  ILogger,
  Memory,
  MemoryInput,
  MemorySearchOptions,
  MemorySearchResult,
  SemanticSearchOptions,
  HybridSearchOptions,
  MemoryStatistics,
  MemoryExportOptions,
  MemoryExportFormat,
  MemoryImportResult,
  MemoryType,
  PaginationOptions,
  PaginatedResponse,
} from '@main/core/interfaces';
import type { IEmbeddingProvider } from './embedding.provider';

/**
 * Memory service for storing and retrieving contextual information.
 * Supports semantic search via embeddings.
 */
@injectable()
export class MemoryService implements IMemoryService {
  constructor(
    @inject(TYPES.MemoryRepository) private memoryRepo: IMemoryRepository,
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.EmbeddingProvider) private embeddingProvider: IEmbeddingProvider
  ) {}

  async store(input: MemoryInput): Promise<Memory> {
    const contentHash = this.hashContent(input.content);

    // Check for duplicates
    const existing = await this.memoryRepo.findByHash(contentHash);
    if (existing) {
      this.logger.debug('Memory already exists, incrementing access count', {
        memoryId: existing.id,
      });
      return this.memoryRepo.incrementAccessCount(existing.id);
    }

    const now = Date.now();
    const memory: Memory = {
      id: `memory-${nanoid(12)}`,
      content: input.content,
      contentHash,
      type: input.type ?? 'note',
      importance: input.importance ?? 0.5,
      tags: input.tags ?? [],
      source: input.source,
      metadata: input.metadata,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };

    // Generate embedding for semantic search
    try {
      memory.embedding = await this.embeddingProvider.embed(input.content);
    } catch (error) {
      this.logger.warn('Failed to generate embedding', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    await this.memoryRepo.create(memory);

    this.logger.info('Memory stored', {
      memoryId: memory.id,
      tags: memory.tags,
    });

    return memory;
  }

  async retrieve(memoryId: string): Promise<Memory | null> {
    const memory = await this.memoryRepo.findById(memoryId);

    if (memory) {
      // Update access stats
      await this.memoryRepo.incrementAccessCount(memoryId);
    }

    return memory;
  }

  async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const allMemories = await this.memoryRepo.findAll({
      limit: 1000, // Get candidates for filtering
    });

    // Generate query embedding for semantic search
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await this.embeddingProvider.embed(query);
    } catch (error) {
      this.logger.warn('Failed to generate query embedding, falling back to text search', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const queryLower = query.toLowerCase();
    const results: MemorySearchResult[] = [];

    for (const memory of allMemories) {
      let score = 0;

      // Semantic similarity (if embedding available)
      if (queryEmbedding && memory.embedding) {
        const semanticScore = this.embeddingProvider.similarity(queryEmbedding, memory.embedding);
        score = Math.max(0, semanticScore); // Ensure non-negative
      } else {
        // Fallback to text matching
        const contentLower = memory.content.toLowerCase();
        
        if (contentLower.includes(queryLower)) {
          score = 0.8;
        } else {
          // Check individual words
          const queryWords = queryLower.split(/\s+/);
          const matchedWords = queryWords.filter(word => contentLower.includes(word));
          score = matchedWords.length / queryWords.length * 0.6;
        }
      }

      // Apply tag filter if specified
      if (options?.tags && options.tags.length > 0) {
        const hasMatchingTag = options.tags.some(tag => memory.tags.includes(tag));
        if (!hasMatchingTag) {
          continue;
        }
      }

      // Apply minimum score filter
      const minScore = options?.minScore ?? 0.3;
      if (score >= minScore) {
        results.push({ memory, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply topK limit
    const topK = options?.topK ?? 10;
    return results.slice(0, topK);
  }

  async searchByTags(tags: string[], _options?: MemorySearchOptions): Promise<Memory[]> {
    return this.memoryRepo.findByTags(tags);
  }

  async update(memoryId: string, updates: Partial<MemoryInput>): Promise<Memory> {
    const existing = await this.memoryRepo.findById(memoryId);

    if (!existing) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const updatedMemory: Memory = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    // Recalculate hash if content changed
    if (updates.content && updates.content !== existing.content) {
      updatedMemory.contentHash = this.hashContent(updates.content);
      // Regenerate embedding for updated content
      try {
        updatedMemory.embedding = await this.embeddingProvider.embed(updates.content);
      } catch (error) {
        this.logger.warn('Failed to regenerate embedding', {
          memoryId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    await this.memoryRepo.update(updatedMemory);

    this.logger.info('Memory updated', { memoryId });
    return updatedMemory;
  }

  async delete(memoryId: string): Promise<void> {
    await this.memoryRepo.delete(memoryId);
    this.logger.info('Memory deleted', { memoryId });
  }

  async getAll(options?: { limit?: number; offset?: number }): Promise<Memory[]> {
    return this.memoryRepo.findAll(options);
  }

  // ============================================================================
  // Semantic Search Methods (AI Hub feature)
  // ============================================================================

  async searchSemantic(options: SemanticSearchOptions): Promise<MemorySearchResult[]> {
    const { query, limit = 10, minSimilarity = 0.5, types } = options;

    // Get candidate memories
    let candidates = types && types.length > 0
      ? await this.memoryRepo.findByTypes(types)
      : await this.memoryRepo.findAll({ limit: 1000 });

    // Filter to only memories with embeddings
    candidates = candidates.filter(m => m.embedding && m.embedding.length > 0);

    if (candidates.length === 0) {
      return [];
    }

    // Generate query embedding
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingProvider.embed(query);
    } catch (error) {
      this.logger.error('Failed to generate query embedding', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }

    // Calculate semantic similarity for each memory
    const results: MemorySearchResult[] = [];
    for (const memory of candidates) {
      const similarity = this.embeddingProvider.similarity(queryEmbedding, memory.embedding!);
      if (similarity >= minSimilarity) {
        results.push({ memory, score: similarity });
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async searchHybrid(options: HybridSearchOptions): Promise<MemorySearchResult[]> {
    const { query, limit = 10, minSimilarity = 0.3, types, semanticWeight = 0.7 } = options;
    const textWeight = 1 - semanticWeight;

    // Get candidate memories
    let candidates = types && types.length > 0
      ? await this.memoryRepo.findByTypes(types)
      : await this.memoryRepo.findAll({ limit: 1000 });

    if (candidates.length === 0) {
      return [];
    }

    // Generate query embedding for semantic component
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await this.embeddingProvider.embed(query);
    } catch (error) {
      this.logger.warn('Failed to generate query embedding, using text-only search', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const results: MemorySearchResult[] = [];

    for (const memory of candidates) {
      let semanticScore = 0;
      let textScore = 0;

      // Semantic score
      if (queryEmbedding && memory.embedding && memory.embedding.length > 0) {
        semanticScore = Math.max(0, this.embeddingProvider.similarity(queryEmbedding, memory.embedding));
      }

      // Text score
      const contentLower = memory.content.toLowerCase();
      if (contentLower.includes(queryLower)) {
        textScore = 1.0;
      } else {
        const matchedWords = queryWords.filter(word => contentLower.includes(word));
        textScore = matchedWords.length / queryWords.length;
      }

      // Combined score
      const combinedScore = (semanticScore * semanticWeight) + (textScore * textWeight);

      if (combinedScore >= minSimilarity) {
        results.push({ memory, score: combinedScore });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ============================================================================
  // Statistics & Analytics (AI Hub feature)
  // ============================================================================

  async getStatistics(): Promise<MemoryStatistics> {
    const allMemories = await this.memoryRepo.findAll({ limit: 10000 });
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    // Calculate by type
    const byType: Record<MemoryType, number> = {
      fact: 0,
      preference: 0,
      instruction: 0,
      context: 0,
      note: 0,
    };

    // Calculate by tag
    const byTag: Record<string, number> = {};

    let totalImportance = 0;
    let withEmbeddings = 0;
    let createdToday = 0;
    let createdThisWeek = 0;
    let createdThisMonth = 0;
    let recentlyAccessed = 0;
    let totalAccessCount = 0;

    for (const memory of allMemories) {
      // By type
      byType[memory.type] = (byType[memory.type] || 0) + 1;

      // By tag
      for (const tag of memory.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }

      // Importance
      totalImportance += memory.importance;

      // Embeddings
      if (memory.embedding && memory.embedding.length > 0) {
        withEmbeddings++;
      }

      // Time-based stats
      const age = now - memory.createdAt;
      if (age < dayMs) createdToday++;
      if (age < weekMs) createdThisWeek++;
      if (age < monthMs) createdThisMonth++;

      // Access stats
      const lastAccessAge = now - memory.lastAccessedAt;
      if (lastAccessAge < weekMs) recentlyAccessed++;
      totalAccessCount += memory.accessCount;
    }

    // Get top tags
    const topTags = Object.entries(byTag)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: allMemories.length,
      byType,
      byTag,
      topTags,
      averageImportance: allMemories.length > 0 ? totalImportance / allMemories.length : 0,
      withEmbeddings,
      createdToday,
      createdThisWeek,
      createdThisMonth,
      recentlyAccessed,
      averageAccessCount: allMemories.length > 0 ? totalAccessCount / allMemories.length : 0,
    };
  }

  async getEmbeddingStatus(): Promise<{ total: number; withEmbedding: number; withoutEmbedding: number }> {
    const allMemories = await this.memoryRepo.findAll({ limit: 10000 });
    
    let withEmbedding = 0;
    for (const memory of allMemories) {
      if (memory.embedding && memory.embedding.length > 0) {
        withEmbedding++;
      }
    }

    return {
      total: allMemories.length,
      withEmbedding,
      withoutEmbedding: allMemories.length - withEmbedding,
    };
  }

  async regenerateEmbeddings(
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number }> {
    const allMemories = await this.memoryRepo.findAll({ limit: 10000 });
    let success = 0;
    let failed = 0;

    for (let i = 0; i < allMemories.length; i++) {
      const memory = allMemories[i]!;
      try {
        const embedding = await this.embeddingProvider.embed(memory.content);
        const updatedMemory: Memory = {
          ...memory,
          embedding,
          updatedAt: Date.now(),
        };
        await this.memoryRepo.update(updatedMemory);
        success++;
      } catch (error) {
        this.logger.warn('Failed to regenerate embedding', {
          memoryId: memory.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }

      if (onProgress) {
        onProgress(i + 1, allMemories.length);
      }
    }

    this.logger.info('Embedding regeneration complete', { success, failed });
    return { success, failed };
  }

  // ============================================================================
  // Import/Export (AI Hub feature)
  // ============================================================================

  async exportMemories(options: MemoryExportOptions): Promise<string> {
    const { format, types, tags, ids } = options;

    // Get memories based on filters
    let memories: Memory[];
    if (ids && ids.length > 0) {
      memories = [];
      for (const id of ids) {
        const memory = await this.memoryRepo.findById(id);
        if (memory) memories.push(memory);
      }
    } else if (types && types.length > 0) {
      memories = await this.memoryRepo.findByTypes(types);
    } else if (tags && tags.length > 0) {
      memories = await this.memoryRepo.findByTags(tags);
    } else {
      memories = await this.memoryRepo.findAll({ limit: 10000 });
    }

    if (format === 'json') {
      return JSON.stringify(memories, null, 2);
    } else {
      // Markdown format
      let markdown = '# Memories Export\n\n';
      for (const memory of memories) {
        markdown += `## ${memory.id}\n\n`;
        markdown += `**Type:** ${memory.type}\n`;
        markdown += `**Importance:** ${memory.importance}\n`;
        markdown += `**Tags:** ${memory.tags.join(', ') || 'none'}\n`;
        markdown += `**Created:** ${new Date(memory.createdAt).toISOString()}\n\n`;
        markdown += `${memory.content}\n\n`;
        markdown += '---\n\n';
      }
      return markdown;
    }
  }

  async importMemories(content: string, format: MemoryExportFormat): Promise<MemoryImportResult> {
    const result: MemoryImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    if (format === 'json') {
      let memories: Partial<Memory>[];
      try {
        memories = JSON.parse(content);
        if (!Array.isArray(memories)) {
          result.errors.push('JSON must be an array of memories');
          return result;
        }
      } catch (error) {
        result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
      }

      for (const memory of memories) {
        try {
          if (!memory.content) {
            result.errors.push(`Memory missing content field`);
            result.failed++;
            continue;
          }

          // Check for duplicate
          const hash = this.hashContent(memory.content);
          const existing = await this.memoryRepo.findByHash(hash);
          if (existing) {
            result.skipped++;
            continue;
          }

          await this.store({
            content: memory.content,
            type: memory.type,
            importance: memory.importance,
            tags: memory.tags,
            source: memory.source,
            metadata: memory.metadata,
          });
          result.imported++;
        } catch (error) {
          result.errors.push(`Failed to import memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.failed++;
        }
      }
    } else {
      // Markdown format - parse sections
      const sections = content.split(/^---$/m);
      for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        // Extract content (everything after the metadata lines)
        const lines = trimmed.split('\n');
        let contentStart = 0;
        let parsedType: MemoryType = 'note';
        let parsedImportance = 0.5;
        const parsedTags: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.startsWith('**Type:**')) {
            parsedType = line.replace('**Type:**', '').trim() as MemoryType;
          } else if (line.startsWith('**Importance:**')) {
            parsedImportance = parseFloat(line.replace('**Importance:**', '').trim()) || 0.5;
          } else if (line.startsWith('**Tags:**')) {
            const tagStr = line.replace('**Tags:**', '').trim();
            if (tagStr && tagStr !== 'none') {
              parsedTags.push(...tagStr.split(',').map(t => t.trim()));
            }
          } else if (line.startsWith('**Created:**')) {
            contentStart = i + 2; // Skip blank line after metadata
            break;
          }
        }

        const memoryContent = lines.slice(contentStart).join('\n').trim();
        if (!memoryContent) continue;

        try {
          const hash = this.hashContent(memoryContent);
          const existing = await this.memoryRepo.findByHash(hash);
          if (existing) {
            result.skipped++;
            continue;
          }

          await this.store({
            content: memoryContent,
            type: parsedType,
            importance: parsedImportance,
            tags: parsedTags,
          });
          result.imported++;
        } catch (error) {
          result.errors.push(`Failed to import section: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.failed++;
        }
      }
    }

    this.logger.info('Memory import complete', {
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  }

  // ============================================================================
  // Bulk Tag Operations (AI Hub feature)
  // ============================================================================

  async bulkAddTag(memoryIds: string[], tag: string): Promise<number> {
    return this.memoryRepo.bulkAddTag(memoryIds, tag);
  }

  async bulkRemoveTag(memoryIds: string[], tag: string): Promise<number> {
    return this.memoryRepo.bulkRemoveTag(memoryIds, tag);
  }

  async renameTag(oldTag: string, newTag: string): Promise<number> {
    return this.memoryRepo.renameTag(oldTag, newTag);
  }

  async deleteTag(tag: string): Promise<number> {
    return this.memoryRepo.deleteTag(tag);
  }

  async getAllTags(): Promise<{ tag: string; count: number }[]> {
    return this.memoryRepo.getAllTags();
  }

  /**
   * Get all memories with cursor-based pagination.
   * More efficient than offset pagination for large datasets.
   */
  async getAllPaginated(options?: PaginationOptions): Promise<PaginatedResponse<Memory>> {
    return this.memoryRepo.findPaginated(options);
  }

  // ============================================================================
  // Semantic Search Methods (AI Hub feature)
  // ============================================================================

  async searchSemantic(options: SemanticSearchOptions): Promise<MemorySearchResult[]> {
    const { query, limit = 10, minSimilarity = 0.5, types } = options;

    // Get candidate memories
    let candidates = types && types.length > 0
      ? await this.memoryRepo.findByTypes(types)
      : await this.memoryRepo.findAll({ limit: 1000 });

    // Filter to only memories with embeddings
    candidates = candidates.filter(m => m.embedding && m.embedding.length > 0);

    if (candidates.length === 0) {
      return [];
    }

    // Generate query embedding
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingProvider.embed(query);
    } catch (error) {
      this.logger.error('Failed to generate query embedding', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }

    // Calculate semantic similarity for each memory
    const results: MemorySearchResult[] = [];
    for (const memory of candidates) {
      const similarity = this.embeddingProvider.similarity(queryEmbedding, memory.embedding!);
      if (similarity >= minSimilarity) {
        results.push({ memory, score: similarity });
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async searchHybrid(options: HybridSearchOptions): Promise<MemorySearchResult[]> {
    const { query, limit = 10, minSimilarity = 0.3, types, semanticWeight = 0.7 } = options;
    const textWeight = 1 - semanticWeight;

    // Get candidate memories
    let candidates = types && types.length > 0
      ? await this.memoryRepo.findByTypes(types)
      : await this.memoryRepo.findAll({ limit: 1000 });

    if (candidates.length === 0) {
      return [];
    }

    // Generate query embedding for semantic component
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await this.embeddingProvider.embed(query);
    } catch (error) {
      this.logger.warn('Failed to generate query embedding, using text-only search', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const results: MemorySearchResult[] = [];

    for (const memory of candidates) {
      let semanticScore = 0;
      let textScore = 0;

      // Semantic score
      if (queryEmbedding && memory.embedding && memory.embedding.length > 0) {
        semanticScore = Math.max(0, this.embeddingProvider.similarity(queryEmbedding, memory.embedding));
      }

      // Text score
      const contentLower = memory.content.toLowerCase();
      if (contentLower.includes(queryLower)) {
        textScore = 1.0;
      } else {
        const matchedWords = queryWords.filter(word => contentLower.includes(word));
        textScore = matchedWords.length / queryWords.length;
      }

      // Combined score
      const combinedScore = (semanticScore * semanticWeight) + (textScore * textWeight);

      if (combinedScore >= minSimilarity) {
        results.push({ memory, score: combinedScore });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ============================================================================
  // Statistics & Analytics (AI Hub feature)
  // ============================================================================

  async getStatistics(): Promise<MemoryStatistics> {
    const allMemories = await this.memoryRepo.findAll({ limit: 10000 });
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    // Calculate by type
    const byType: Record<MemoryType, number> = {
      fact: 0,
      preference: 0,
      instruction: 0,
      context: 0,
      note: 0,
    };

    // Calculate by tag
    const byTag: Record<string, number> = {};

    let totalImportance = 0;
    let withEmbeddings = 0;
    let createdToday = 0;
    let createdThisWeek = 0;
    let createdThisMonth = 0;
    let recentlyAccessed = 0;
    let totalAccessCount = 0;

    for (const memory of allMemories) {
      // By type
      byType[memory.type] = (byType[memory.type] || 0) + 1;

      // By tag
      for (const tag of memory.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }

      // Importance
      totalImportance += memory.importance;

      // Embeddings
      if (memory.embedding && memory.embedding.length > 0) {
        withEmbeddings++;
      }

      // Time-based stats
      const age = now - memory.createdAt;
      if (age < dayMs) createdToday++;
      if (age < weekMs) createdThisWeek++;
      if (age < monthMs) createdThisMonth++;

      // Access stats
      const lastAccessAge = now - memory.lastAccessedAt;
      if (lastAccessAge < weekMs) recentlyAccessed++;
      totalAccessCount += memory.accessCount;
    }

    // Get top tags
    const topTags = Object.entries(byTag)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: allMemories.length,
      byType,
      byTag,
      topTags,
      averageImportance: allMemories.length > 0 ? totalImportance / allMemories.length : 0,
      withEmbeddings,
      createdToday,
      createdThisWeek,
      createdThisMonth,
      recentlyAccessed,
      averageAccessCount: allMemories.length > 0 ? totalAccessCount / allMemories.length : 0,
    };
  }

  async getEmbeddingStatus(): Promise<{ total: number; withEmbedding: number; withoutEmbedding: number }> {
    const allMemories = await this.memoryRepo.findAll({ limit: 10000 });
    
    let withEmbedding = 0;
    for (const memory of allMemories) {
      if (memory.embedding && memory.embedding.length > 0) {
        withEmbedding++;
      }
    }

    return {
      total: allMemories.length,
      withEmbedding,
      withoutEmbedding: allMemories.length - withEmbedding,
    };
  }

  async regenerateEmbeddings(
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number }> {
    const allMemories = await this.memoryRepo.findAll({ limit: 10000 });
    let success = 0;
    let failed = 0;

    for (let i = 0; i < allMemories.length; i++) {
      const memory = allMemories[i]!;
      try {
        const embedding = await this.embeddingProvider.embed(memory.content);
        const updatedMemory: Memory = {
          ...memory,
          embedding,
          updatedAt: Date.now(),
        };
        await this.memoryRepo.update(updatedMemory);
        success++;
      } catch (error) {
        this.logger.warn('Failed to regenerate embedding', {
          memoryId: memory.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }

      if (onProgress) {
        onProgress(i + 1, allMemories.length);
      }
    }

    this.logger.info('Embedding regeneration complete', { success, failed });
    return { success, failed };
  }

  // ============================================================================
  // Import/Export (AI Hub feature)
  // ============================================================================

  async exportMemories(options: MemoryExportOptions): Promise<string> {
    const { format, types, tags, ids } = options;

    // Get memories based on filters
    let memories: Memory[];
    if (ids && ids.length > 0) {
      memories = [];
      for (const id of ids) {
        const memory = await this.memoryRepo.findById(id);
        if (memory) memories.push(memory);
      }
    } else if (types && types.length > 0) {
      memories = await this.memoryRepo.findByTypes(types);
    } else if (tags && tags.length > 0) {
      memories = await this.memoryRepo.findByTags(tags);
    } else {
      memories = await this.memoryRepo.findAll({ limit: 10000 });
    }

    if (format === 'json') {
      return JSON.stringify(memories, null, 2);
    } else {
      // Markdown format
      let markdown = '# Memories Export\n\n';
      for (const memory of memories) {
        markdown += `## ${memory.id}\n\n`;
        markdown += `**Type:** ${memory.type}\n`;
        markdown += `**Importance:** ${memory.importance}\n`;
        markdown += `**Tags:** ${memory.tags.join(', ') || 'none'}\n`;
        markdown += `**Created:** ${new Date(memory.createdAt).toISOString()}\n\n`;
        markdown += `${memory.content}\n\n`;
        markdown += '---\n\n';
      }
      return markdown;
    }
  }

  async importMemories(content: string, format: MemoryExportFormat): Promise<MemoryImportResult> {
    const result: MemoryImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    if (format === 'json') {
      let memories: Partial<Memory>[];
      try {
        memories = JSON.parse(content);
        if (!Array.isArray(memories)) {
          result.errors.push('JSON must be an array of memories');
          return result;
        }
      } catch (error) {
        result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
      }

      for (const memory of memories) {
        try {
          if (!memory.content) {
            result.errors.push(`Memory missing content field`);
            result.failed++;
            continue;
          }

          // Check for duplicate
          const hash = this.hashContent(memory.content);
          const existing = await this.memoryRepo.findByHash(hash);
          if (existing) {
            result.skipped++;
            continue;
          }

          await this.store({
            content: memory.content,
            type: memory.type,
            importance: memory.importance,
            tags: memory.tags,
            source: memory.source,
            metadata: memory.metadata,
          });
          result.imported++;
        } catch (error) {
          result.errors.push(`Failed to import memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.failed++;
        }
      }
    } else {
      // Markdown format - parse sections
      const sections = content.split(/^---$/m);
      for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        // Extract content (everything after the metadata lines)
        const lines = trimmed.split('\n');
        let contentStart = 0;
        let parsedType: MemoryType = 'note';
        let parsedImportance = 0.5;
        const parsedTags: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.startsWith('**Type:**')) {
            parsedType = line.replace('**Type:**', '').trim() as MemoryType;
          } else if (line.startsWith('**Importance:**')) {
            parsedImportance = parseFloat(line.replace('**Importance:**', '').trim()) || 0.5;
          } else if (line.startsWith('**Tags:**')) {
            const tagStr = line.replace('**Tags:**', '').trim();
            if (tagStr && tagStr !== 'none') {
              parsedTags.push(...tagStr.split(',').map(t => t.trim()));
            }
          } else if (line.startsWith('**Created:**')) {
            contentStart = i + 2; // Skip blank line after metadata
            break;
          }
        }

        const memoryContent = lines.slice(contentStart).join('\n').trim();
        if (!memoryContent) continue;

        try {
          const hash = this.hashContent(memoryContent);
          const existing = await this.memoryRepo.findByHash(hash);
          if (existing) {
            result.skipped++;
            continue;
          }

          await this.store({
            content: memoryContent,
            type: parsedType,
            importance: parsedImportance,
            tags: parsedTags,
          });
          result.imported++;
        } catch (error) {
          result.errors.push(`Failed to import section: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.failed++;
        }
      }
    }

    this.logger.info('Memory import complete', {
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  }

  // ============================================================================
  // Bulk Tag Operations (AI Hub feature)
  // ============================================================================

  async bulkAddTag(memoryIds: string[], tag: string): Promise<number> {
    return this.memoryRepo.bulkAddTag(memoryIds, tag);
  }

  async bulkRemoveTag(memoryIds: string[], tag: string): Promise<number> {
    return this.memoryRepo.bulkRemoveTag(memoryIds, tag);
  }

  async renameTag(oldTag: string, newTag: string): Promise<number> {
    return this.memoryRepo.renameTag(oldTag, newTag);
  }

  async deleteTag(tag: string): Promise<number> {
    return this.memoryRepo.deleteTag(tag);
  }

  async getAllTags(): Promise<{ tag: string; count: number }[]> {
    return this.memoryRepo.getAllTags();
  }

  /**
   * Generate a hash of the content for deduplication.
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
