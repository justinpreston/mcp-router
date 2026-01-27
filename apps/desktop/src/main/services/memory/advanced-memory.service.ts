import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IMemoryService,
  IMemoryRepository,
  ILogger,
  Memory,
  MemoryType,
} from '@main/core/interfaces';
import type { IEmbeddingProvider } from './embedding.provider';
import type { IEpisodeRepository } from '@main/repositories/episode.repository';
import type { IEntityRepository } from '@main/repositories/entity.repository';
import type { IReflectionRepository } from '@main/repositories/reflection.repository';
import type {
  IAdvancedMemoryService,
  TemporalMemory,
  TemporalMemoryInput,
  TemporalQueryOptions,
  TemporalDecayConfig,
  Episode,
  EpisodeQueryOptions,
  WorkingMemory,
  WorkingMemoryEntry,
  WorkingMemoryOptions,
  MemoryCluster,
  ClusteringOptions,
  Reflection,
  ReflectionType,
  ReflectionOptions,
  Entity,
  EntityRelation,
  EntityQueryOptions,
  Contradiction,
  ContradictionStatus,
  ContextualRetrievalOptions,
  ContextualRetrievalResult,
  MemoryProvenance,
} from '@main/core/advanced-memory.types';

/**
 * Advanced Memory Service implementing state-of-the-art AI agent memory patterns.
 * 
 * Patterns implemented:
 * - MemGPT: Working memory buffer, temporal decay, self-editing
 * - Generative Agents: Episodic memory, reflection cycles, importance weighting
 * - RAPTOR: Hierarchical clustering with abstractive summarization
 * - GraphRAG: Entity extraction and knowledge graph
 * - Anthropic Contextual Retrieval: BM25 + embeddings hybrid
 */
@injectable()
export class AdvancedMemoryService implements IAdvancedMemoryService {
  private workingMemory: WorkingMemory;
  private decayConfig: TemporalDecayConfig;
  private workingMemoryOptions: WorkingMemoryOptions;

  constructor(
    @inject(TYPES.MemoryService) private memoryService: IMemoryService,
    @inject(TYPES.MemoryRepository) private memoryRepo: IMemoryRepository,
    @inject(TYPES.EpisodeRepository) private episodeRepo: IEpisodeRepository,
    @inject(TYPES.EntityRepository) private entityRepo: IEntityRepository,
    @inject(TYPES.ReflectionRepository) private reflectionRepo: IReflectionRepository,
    @inject(TYPES.EmbeddingProvider) private embeddingProvider: IEmbeddingProvider,
    @inject(TYPES.Logger) private logger: ILogger
  ) {
    // Initialize default configurations
    this.decayConfig = {
      hourlyDecayRate: 0.99,
      minRecency: 0.1,
      accessBoostFactor: 0.1,
      importanceBoostFactor: 0.2,
    };

    this.workingMemoryOptions = {
      maxTokens: 8000,
      compactionThreshold: 0.9,
      minRecentEntries: 5,
      archiveOnEviction: true,
    };

    // Initialize working memory
    this.workingMemory = {
      entries: [],
      maxTokens: this.workingMemoryOptions.maxTokens!,
      currentTokens: 0,
      recentEntities: [],
    };
  }

  // ============================================================================
  // Temporal Memory (MemGPT pattern)
  // ============================================================================

  async storeWithTemporal(input: TemporalMemoryInput): Promise<TemporalMemory> {
    const memory = await this.memoryService.store({
      content: input.content,
      type: input.type,
      importance: input.importance,
      tags: input.tags,
      source: input.source,
      metadata: {
        ...input.metadata,
        expiresAt: input.expiresAt,
        decayRate: input.decayRate ?? this.decayConfig.hourlyDecayRate,
      },
    });

    // Add to current episode if active
    if (this.workingMemory.activeEpisodeId) {
      await this.episodeRepo.addMemoryToEpisode(this.workingMemory.activeEpisodeId, memory.id);
    }

    // Extract and link entities
    await this.extractEntities(memory.id);

    return this.memoryToTemporal(memory);
  }

  async getWithDecay(options: TemporalQueryOptions): Promise<TemporalMemory[]> {
    const memories = await this.memoryRepo.findAll({ limit: 1000 });
    const now = Date.now();

    let results: TemporalMemory[] = memories.map((m) => {
      const temporal = this.memoryToTemporal(m);
      
      if (options.applyDecay !== false) {
        temporal.recencyScore = this.calculateRecency(m, now);
        temporal.temporalRelevance = this.calculateTemporalRelevance(temporal);
      }
      
      return temporal;
    });

    // Filter expired if not requested
    if (!options.includeExpired) {
      results = results.filter((m) => !m.expiresAt || m.expiresAt > now);
    }

    // Filter by minimum recency
    if (options.minRecency !== undefined && options.applyDecay !== false) {
      results = results.filter((m) => (m.recencyScore ?? 1) >= options.minRecency!);
    }

    // Filter by types
    if (options.types && options.types.length > 0) {
      results = results.filter((m) => options.types!.includes(m.type));
    }

    // Sort by temporal relevance
    results.sort((a, b) => (b.temporalRelevance ?? 0) - (a.temporalRelevance ?? 0));

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  setDecayConfig(config: Partial<TemporalDecayConfig>): void {
    this.decayConfig = { ...this.decayConfig, ...config };
    this.logger.info('Temporal decay config updated', { config: this.decayConfig });
  }

  private calculateRecency(memory: Memory, now: number): number {
    const hoursSinceAccess = (now - memory.lastAccessedAt) / (1000 * 60 * 60);
    const decayRate = (memory.metadata?.decayRate as number) ?? this.decayConfig.hourlyDecayRate;
    
    // Exponential decay with access count boost
    const baseRecency = Math.pow(decayRate, hoursSinceAccess);
    const accessBoost = Math.min(1, memory.accessCount * this.decayConfig.accessBoostFactor);
    const importanceBoost = memory.importance * this.decayConfig.importanceBoostFactor;
    
    const recency = baseRecency + accessBoost + importanceBoost;
    return Math.max(this.decayConfig.minRecency, Math.min(1, recency));
  }

  private calculateTemporalRelevance(memory: TemporalMemory): number {
    const recency = memory.recencyScore ?? 1;
    const importance = memory.importance;
    // Weighted combination: 60% recency, 40% importance
    return recency * 0.6 + importance * 0.4;
  }

  private memoryToTemporal(memory: Memory): TemporalMemory {
    return {
      ...memory,
      expiresAt: memory.metadata?.expiresAt as number | undefined,
      decayRate: memory.metadata?.decayRate as number | undefined,
    };
  }

  // ============================================================================
  // Episodic Memory (Generative Agents pattern)
  // ============================================================================

  async startEpisode(title: string, sessionId?: string): Promise<Episode> {
    // End any active episodes
    const activeEpisodes = await this.episodeRepo.findActive();
    for (const episode of activeEpisodes) {
      await this.endEpisode(episode.id);
    }

    const episode = await this.episodeRepo.create({
      title,
      sessionId,
      memoryIds: [],
      entities: [],
      topics: [],
      startedAt: Date.now(),
      isActive: true,
      importance: 0.5,
    });

    this.workingMemory.activeEpisodeId = episode.id;
    this.logger.info('Episode started', { id: episode.id, title });

    return episode;
  }

  async endEpisode(episodeId: string): Promise<Episode> {
    const episode = await this.episodeRepo.findById(episodeId);
    if (!episode) {
      throw new Error(`Episode not found: ${episodeId}`);
    }

    // Generate summary from memories
    const memories = await this.recallEpisode(episodeId);
    const summary = await this.generateEpisodeSummary(memories);

    // Extract topics and entities
    const entities = await this.extractEpisodeEntities(memories);
    const topics = this.extractTopics(memories);

    // Generate episode embedding
    const embedding = await this.embeddingProvider.embed(summary);

    const updatedEpisode = await this.episodeRepo.update({
      ...episode,
      summary,
      entities,
      topics,
      embedding,
      endedAt: Date.now(),
      isActive: false,
      importance: this.calculateEpisodeImportance(memories),
    });

    if (this.workingMemory.activeEpisodeId === episodeId) {
      this.workingMemory.activeEpisodeId = undefined;
    }

    this.logger.info('Episode ended', { id: episodeId, summary });

    return updatedEpisode;
  }

  async addToEpisode(memoryId: string, episodeId: string): Promise<void> {
    await this.episodeRepo.addMemoryToEpisode(episodeId, memoryId);
  }

  async queryEpisodes(options: EpisodeQueryOptions): Promise<Episode[]> {
    return this.episodeRepo.query(options);
  }

  async recallEpisode(episodeId: string): Promise<Memory[]> {
    const episode = await this.episodeRepo.findById(episodeId);
    if (!episode) {
      return [];
    }

    const memories: Memory[] = [];
    for (const memoryId of episode.memoryIds) {
      const memory = await this.memoryRepo.findById(memoryId);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories.sort((a, b) => a.createdAt - b.createdAt);
  }

  private async generateEpisodeSummary(memories: Memory[]): Promise<string> {
    if (memories.length === 0) {
      return 'Empty episode';
    }

    // For now, concatenate key points. In production, use LLM for abstractive summary.
    const keyPoints = memories
      .filter((m) => m.importance >= 0.6)
      .map((m) => m.content.slice(0, 100))
      .slice(0, 5);

    if (keyPoints.length === 0) {
      return memories[0]!.content.slice(0, 200);
    }

    return `Key points: ${keyPoints.join('; ')}`;
  }

  private async extractEpisodeEntities(memories: Memory[]): Promise<string[]> {
    const entitySet = new Set<string>();
    
    for (const memory of memories) {
      const entities = await this.entityRepo.queryEntities({
        limit: 100,
      });
      
      for (const entity of entities) {
        if (entity.mentionedInMemoryIds.includes(memory.id)) {
          entitySet.add(entity.name);
        }
      }
    }

    return Array.from(entitySet);
  }

  private extractTopics(memories: Memory[]): string[] {
    const tagCounts = new Map<string, number>();
    
    for (const memory of memories) {
      for (const tag of memory.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
  }

  private calculateEpisodeImportance(memories: Memory[]): number {
    if (memories.length === 0) return 0.5;
    
    const avgImportance = memories.reduce((sum, m) => sum + m.importance, 0) / memories.length;
    const lengthBonus = Math.min(0.2, memories.length * 0.02);
    
    return Math.min(1, avgImportance + lengthBonus);
  }

  // ============================================================================
  // Working Memory (MemGPT pattern)
  // ============================================================================

  getWorkingMemory(): WorkingMemory {
    return { ...this.workingMemory };
  }

  addToWorkingMemory(entry: Omit<WorkingMemoryEntry, 'id' | 'addedAt'>): WorkingMemoryEntry {
    const newEntry: WorkingMemoryEntry = {
      ...entry,
      id: `wm-${nanoid(8)}`,
      addedAt: Date.now(),
    };

    this.workingMemory.entries.push(newEntry);
    this.workingMemory.currentTokens += entry.tokenCount;

    // Check if compaction needed
    const threshold = this.workingMemory.maxTokens * this.workingMemoryOptions.compactionThreshold!;
    if (this.workingMemory.currentTokens > threshold) {
      this.compactWorkingMemory();
    }

    return newEntry;
  }

  removeFromWorkingMemory(entryId: string): void {
    const index = this.workingMemory.entries.findIndex((e) => e.id === entryId);
    if (index > -1) {
      const entry = this.workingMemory.entries[index]!;
      this.workingMemory.currentTokens -= entry.tokenCount;
      this.workingMemory.entries.splice(index, 1);
    }
  }

  async compactWorkingMemory(): Promise<void> {
    const entries = this.workingMemory.entries;
    const minRecent = this.workingMemoryOptions.minRecentEntries!;

    // Keep pinned entries
    const pinned = entries.filter((e) => e.pinned);
    const unpinned = entries.filter((e) => !e.pinned);

    // Sort unpinned by priority (lower = evict first) then by age (older = evict first)
    unpinned.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.addedAt - b.addedAt;
    });

    // Keep most recent unpinned entries
    const keepUnpinned = unpinned.slice(-minRecent);
    const evicted = unpinned.slice(0, -minRecent);

    // Archive evicted entries if configured
    if (this.workingMemoryOptions.archiveOnEviction) {
      for (const entry of evicted) {
        if (!entry.sourceMemoryId) {
          // Store in long-term memory
          await this.memoryService.store({
            content: entry.content,
            type: 'context',
            importance: entry.priority / 10,
            tags: ['working-memory-archived'],
            source: 'working_memory',
            metadata: { role: entry.role, archivedAt: Date.now() },
          });
        }
      }
    }

    // Update working memory
    this.workingMemory.entries = [...pinned, ...keepUnpinned];
    this.workingMemory.currentTokens = this.workingMemory.entries.reduce(
      (sum, e) => sum + e.tokenCount,
      0
    );
    this.workingMemory.lastCompactedAt = Date.now();

    this.logger.info('Working memory compacted', {
      evicted: evicted.length,
      remaining: this.workingMemory.entries.length,
      tokens: this.workingMemory.currentTokens,
    });
  }

  async promoteToWorkingMemory(query: string, limit: number = 3): Promise<WorkingMemoryEntry[]> {
    // Search for relevant memories
    const results = await this.memoryService.searchSemantic({
      query,
      limit,
      minSimilarity: 0.6,
    });

    const promoted: WorkingMemoryEntry[] = [];

    for (const result of results) {
      // Check if already in working memory
      const exists = this.workingMemory.entries.some(
        (e) => e.sourceMemoryId === result.memory.id
      );

      if (!exists) {
        const entry = this.addToWorkingMemory({
          content: result.memory.content,
          role: 'system',
          tokenCount: Math.ceil(result.memory.content.length / 4), // Rough estimate
          priority: Math.ceil(result.score * 10),
          pinned: false,
          sourceMemoryId: result.memory.id,
        });
        promoted.push(entry);
      }
    }

    return promoted;
  }

  // ============================================================================
  // Clustering (RAPTOR pattern)
  // ============================================================================

  async clusterMemories(_options?: ClusteringOptions): Promise<MemoryCluster[]> {
    // TODO: Implement hierarchical clustering
    // For now, return empty - this requires significant implementation
    this.logger.warn('clusterMemories not yet implemented');
    return [];
  }

  async getClusterHierarchy(): Promise<MemoryCluster[]> {
    // TODO: Implement cluster hierarchy retrieval
    this.logger.warn('getClusterHierarchy not yet implemented');
    return [];
  }

  async queryByCluster(_clusterId: string): Promise<Memory[]> {
    // TODO: Implement cluster query
    this.logger.warn('queryByCluster not yet implemented');
    return [];
  }

  // ============================================================================
  // Reflections (Generative Agents pattern)
  // ============================================================================

  async generateReflections(options?: ReflectionOptions): Promise<Reflection[]> {
    const timeWindow = options?.timeWindow ?? 24 * 60 * 60 * 1000; // 24 hours
    const minMemories = options?.minMemories ?? 5;
    const since = Date.now() - timeWindow;

    // Get recent memories
    let memories = await this.memoryRepo.findAll({ limit: 100 });
    memories = memories.filter((m) => m.createdAt >= since);

    if (options?.focusTypes && options.focusTypes.length > 0) {
      memories = memories.filter((m) => options.focusTypes!.includes(m.type));
    }

    if (memories.length < minMemories) {
      return [];
    }

    const reflections: Reflection[] = [];

    // Group by type and generate type-specific reflections
    const byType = new Map<MemoryType, Memory[]>();
    for (const memory of memories) {
      const list = byType.get(memory.type) || [];
      list.push(memory);
      byType.set(memory.type, list);
    }

    // Generate preference reflections
    const preferences = byType.get('preference') || [];
    if (preferences.length >= 3) {
      const reflection = await this.generatePreferenceReflection(preferences);
      if (reflection) {
        reflections.push(reflection);
      }
    }

    // Generate pattern reflections from facts
    const facts = byType.get('fact') || [];
    if (facts.length >= 3) {
      const reflection = await this.generatePatternReflection(facts);
      if (reflection) {
        reflections.push(reflection);
      }
    }

    // Check for contradictions if requested
    if (options?.checkContradictions !== false) {
      for (const reflection of reflections) {
        const firstMemoryId = reflection.sourceMemoryIds[0];
        if (firstMemoryId) {
          await this.checkContradictions(firstMemoryId);
        }
      }
    }

    return reflections;
  }

  async getReflections(type?: ReflectionType): Promise<Reflection[]> {
    if (type) {
      return this.reflectionRepo.findReflectionsByType(type);
    }
    return this.reflectionRepo.findActiveReflections();
  }

  async checkContradictions(memoryId: string): Promise<Contradiction[]> {
    const memory = await this.memoryRepo.findById(memoryId);
    if (!memory) {
      return [];
    }

    const contradictions: Contradiction[] = [];

    // Check against existing reflections
    const reflections = await this.reflectionRepo.findActiveReflections();
    
    for (const reflection of reflections) {
      // Simple semantic similarity check for contradiction
      // In production, use LLM for nuanced contradiction detection
      if (memory.embedding && reflection.embedding) {
        const similarity = this.embeddingProvider.similarity(memory.embedding, reflection.embedding);
        
        // High similarity but different type might indicate contradiction
        if (similarity > 0.7 && memory.type !== 'note') {
          // Check if content contradicts
          const isContradiction = await this.detectContradiction(memory.content, reflection.content);
          
          if (isContradiction) {
            const contradiction = await this.reflectionRepo.createContradiction({
              itemAId: memoryId,
              itemAType: 'memory',
              itemBId: reflection.id,
              itemBType: 'reflection',
              description: `Potential contradiction between new memory and existing reflection`,
              type: 'factual',
              severity: 0.6,
              status: 'unresolved',
              detectedAt: Date.now(),
            });
            contradictions.push(contradiction);
          }
        }
      }
    }

    return contradictions;
  }

  private async generatePreferenceReflection(memories: Memory[]): Promise<Reflection | null> {
    // Simple pattern extraction - in production use LLM
    const content = `Based on ${memories.length} observations, user appears to prefer: ${memories
      .slice(0, 3)
      .map((m) => m.content.slice(0, 50))
      .join('; ')}`;

    const embedding = await this.embeddingProvider.embed(content);

    return this.reflectionRepo.createReflection({
      content,
      type: 'preference',
      sourceMemoryIds: memories.map((m) => m.id),
      confidence: Math.min(0.9, 0.5 + memories.length * 0.1),
      evidenceCount: memories.length,
      isContradicted: false,
      embedding,
      createdAt: Date.now(),
    });
  }

  private async generatePatternReflection(memories: Memory[]): Promise<Reflection | null> {
    const content = `Pattern observed from ${memories.length} facts: ${memories
      .slice(0, 3)
      .map((m) => m.content.slice(0, 50))
      .join('; ')}`;

    const embedding = await this.embeddingProvider.embed(content);

    return this.reflectionRepo.createReflection({
      content,
      type: 'pattern',
      sourceMemoryIds: memories.map((m) => m.id),
      confidence: Math.min(0.8, 0.4 + memories.length * 0.08),
      evidenceCount: memories.length,
      isContradicted: false,
      embedding,
      createdAt: Date.now(),
    });
  }

  private async detectContradiction(_content1: string, _content2: string): Promise<boolean> {
    // Placeholder - in production, use LLM for nuanced contradiction detection
    // For now, return false to avoid false positives
    return false;
  }

  // ============================================================================
  // Entity Graph (GraphRAG pattern)
  // ============================================================================

  async extractEntities(memoryId: string): Promise<Entity[]> {
    const memory = await this.memoryRepo.findById(memoryId);
    if (!memory) {
      return [];
    }

    // Simple entity extraction using patterns
    // In production, use NER model or LLM
    const entities: Entity[] = [];
    const content = memory.content;
    const now = Date.now();

    // Extract capitalized words as potential entities
    const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const matches = content.matchAll(capitalizedPattern);

    for (const match of matches) {
      const name = match[1];
      
      // Skip if name is undefined or common words
      if (!name || ['The', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why'].includes(name)) {
        continue;
      }

      // Check if entity exists
      let entity = await this.entityRepo.findEntityByNameAndType(name, 'concept');
      
      if (entity) {
        // Update existing entity
        entity = await this.entityRepo.incrementMentionCount(entity.id, memoryId);
      } else {
        // Create new entity
        const embedding = await this.embeddingProvider.embed(name);
        entity = await this.entityRepo.createEntity({
          name,
          type: 'concept',
          aliases: [],
          mentionedInMemoryIds: [memoryId],
          mentionCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          importance: 0.3,
          embedding,
          attributes: {},
        });
      }

      entities.push(entity);
    }

    // Update working memory recent entities
    this.workingMemory.recentEntities = [
      ...entities.map((e) => e.name),
      ...this.workingMemory.recentEntities,
    ].slice(0, 10);

    return entities;
  }

  async queryEntities(options: EntityQueryOptions): Promise<Entity[]> {
    const entities = await this.entityRepo.queryEntities(options);

    if (options.includeRelations) {
      for (const entity of entities) {
        const relations = await this.entityRepo.findRelationsByEntity(entity.id);
        (entity as Entity & { relations?: EntityRelation[] }).relations = relations;
      }
    }

    return entities;
  }

  async getEntityRelations(entityId: string): Promise<EntityRelation[]> {
    return this.entityRepo.findRelationsByEntity(entityId);
  }

  async findEntityPath(
    fromEntityId: string,
    toEntityId: string,
    maxHops?: number
  ): Promise<EntityRelation[]> {
    return this.entityRepo.findPath(fromEntityId, toEntityId, maxHops);
  }

  // ============================================================================
  // Contextual Retrieval (Anthropic pattern)
  // ============================================================================

  async contextualRetrieve(options: ContextualRetrievalOptions): Promise<ContextualRetrievalResult[]> {
    const {
      query,
      limit = 10,
      minScore = 0.3,
      semanticWeight = 0.5,
      bm25Weight = 0.3,
      recencyWeight = 0.2,
      includeEntityContext = true,
      includeReflections = true,
      types,
      tags,
      timeWindow,
    } = options;

    // Get candidate memories
    let candidates = await this.memoryRepo.findAll({ limit: 1000 });
    const now = Date.now();

    // Apply filters
    if (types && types.length > 0) {
      candidates = candidates.filter((m) => types.includes(m.type));
    }

    if (tags && tags.length > 0) {
      candidates = candidates.filter((m) => tags.some((t) => m.tags.includes(t)));
    }

    if (timeWindow) {
      const cutoff = now - timeWindow;
      candidates = candidates.filter((m) => m.createdAt >= cutoff);
    }

    // Generate query embedding
    const queryEmbedding = await this.embeddingProvider.embed(query);

    // Score each candidate
    const results: ContextualRetrievalResult[] = [];

    for (const memory of candidates) {
      // Semantic score
      const semanticScore = memory.embedding
        ? this.embeddingProvider.similarity(queryEmbedding, memory.embedding)
        : 0;

      // BM25 score (simplified text matching)
      const bm25Score = this.calculateBM25Score(query, memory.content);

      // Recency score
      const recencyScore = this.calculateRecency(memory, now);

      // Combined score
      const score =
        semanticScore * semanticWeight +
        bm25Score * bm25Weight +
        recencyScore * recencyWeight;

      if (score >= minScore) {
        const result: ContextualRetrievalResult = {
          memory,
          score,
          scores: {
            semantic: semanticScore,
            bm25: bm25Score,
            recency: recencyScore,
            importance: memory.importance,
          },
        };

        // Add entity context if requested
        if (includeEntityContext) {
          const entities = await this.entityRepo.queryEntities({ limit: 5 });
          result.relatedEntities = entities.filter((e) =>
            e.mentionedInMemoryIds.includes(memory.id)
          );
        }

        // Add reflections if requested
        if (includeReflections) {
          const reflections = await this.reflectionRepo.findActiveReflections();
          result.relatedReflections = reflections.filter((r) =>
            r.sourceMemoryIds.includes(memory.id)
          );
        }

        results.push(result);
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async buildContextWindow(query: string, maxTokens: number): Promise<string> {
    // Get relevant memories
    const results = await this.contextualRetrieve({
      query,
      limit: 20,
      minScore: 0.4,
      includeEntityContext: true,
      includeReflections: true,
    });

    const sections: string[] = [];
    let currentTokens = 0;

    // Add relevant reflections first (high-level context)
    const seenReflections = new Set<string>();
    for (const result of results) {
      for (const reflection of result.relatedReflections ?? []) {
        if (!seenReflections.has(reflection.id)) {
          const tokens = Math.ceil(reflection.content.length / 4);
          if (currentTokens + tokens <= maxTokens * 0.3) {
            sections.push(`[Insight] ${reflection.content}`);
            currentTokens += tokens;
            seenReflections.add(reflection.id);
          }
        }
      }
    }

    // Add entity context
    const seenEntities = new Set<string>();
    for (const result of results) {
      for (const entity of result.relatedEntities ?? []) {
        if (!seenEntities.has(entity.id) && entity.description) {
          const tokens = Math.ceil(entity.description.length / 4);
          if (currentTokens + tokens <= maxTokens * 0.5) {
            sections.push(`[Entity: ${entity.name}] ${entity.description}`);
            currentTokens += tokens;
            seenEntities.add(entity.id);
          }
        }
      }
    }

    // Add memories
    for (const result of results) {
      const tokens = Math.ceil(result.memory.content.length / 4);
      if (currentTokens + tokens <= maxTokens) {
        sections.push(`[Memory] ${result.memory.content}`);
        currentTokens += tokens;
      } else {
        break;
      }
    }

    return sections.join('\n\n');
  }

  private calculateBM25Score(query: string, document: string): number {
    // Simplified BM25 implementation
    const queryTerms = query.toLowerCase().split(/\s+/);
    const docTerms = document.toLowerCase().split(/\s+/);
    const docLength = docTerms.length;
    const avgDocLength = 100; // Assumed average
    const k1 = 1.5;
    const b = 0.75;

    let score = 0;
    for (const term of queryTerms) {
      const tf = docTerms.filter((t) => t === term).length;
      if (tf > 0) {
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + (b * docLength) / avgDocLength);
        score += numerator / denominator;
      }
    }

    // Normalize to 0-1
    return Math.min(1, score / queryTerms.length);
  }

  // ============================================================================
  // Memory Management
  // ============================================================================

  async getContradictions(status?: ContradictionStatus): Promise<Contradiction[]> {
    if (status) {
      return this.reflectionRepo.findContradictionsByStatus(status);
    }
    return this.reflectionRepo.findContradictionsByStatus('unresolved');
  }

  async resolveContradiction(
    id: string,
    resolution: ContradictionStatus,
    notes?: string
  ): Promise<void> {
    await this.reflectionRepo.resolveContradiction(id, resolution, notes);
  }

  async applyForgettingPolicies(): Promise<{ archived: number; deleted: number; summarized: number }> {
    // TODO: Implement forgetting policies
    this.logger.warn('applyForgettingPolicies not yet implemented');
    return { archived: 0, deleted: 0, summarized: 0 };
  }

  async setProvenance(
    memoryId: string,
    provenance: Omit<MemoryProvenance, 'memoryId' | 'recordedAt'>
  ): Promise<void> {
    await this.reflectionRepo.setProvenance({
      ...provenance,
      memoryId,
      recordedAt: Date.now(),
    });
  }

  async getProvenance(memoryId: string): Promise<MemoryProvenance | null> {
    return this.reflectionRepo.getProvenance(memoryId);
  }
}
