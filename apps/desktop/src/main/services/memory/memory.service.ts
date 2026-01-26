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

/**
 * Memory service for storing and retrieving contextual information.
 * Supports semantic search via embeddings (to be implemented with embedding provider).
 */
@injectable()
export class MemoryService implements IMemoryService {
  constructor(
    @inject(TYPES.MemoryRepository) private memoryRepo: IMemoryRepository,
    @inject(TYPES.Logger) private logger: ILogger
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

    // TODO: Generate embedding when embedding provider is available
    // memory.embedding = await this.embeddingProvider.embed(input.content);

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
    // TODO: Implement semantic search with embeddings
    // For now, use simple text matching
    const allMemories = await this.memoryRepo.findAll({
      limit: 1000, // Get candidates for filtering
    });

    const queryLower = query.toLowerCase();
    const results: MemorySearchResult[] = [];

    for (const memory of allMemories) {
      // Simple text matching score
      const contentLower = memory.content.toLowerCase();
      let score = 0;

      if (contentLower.includes(queryLower)) {
        score = 0.8;
      } else {
        // Check individual words
        const queryWords = queryLower.split(/\s+/);
        const matchedWords = queryWords.filter(word => contentLower.includes(word));
        score = matchedWords.length / queryWords.length * 0.6;
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
      // TODO: Regenerate embedding
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
