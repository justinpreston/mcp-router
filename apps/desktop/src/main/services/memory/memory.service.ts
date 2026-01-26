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

  /**
   * Generate a hash of the content for deduplication.
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
