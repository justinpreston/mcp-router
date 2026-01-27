/**
 * Advanced Memory System - State-of-the-Art AI Agent Context Management
 * 
 * This module implements cutting-edge memory patterns from:
 * - MemGPT (2023): Tiered memory with working/archival separation, self-editing
 * - Generative Agents (Stanford 2023): Reflection cycles, importance weighting
 * - RAPTOR (Stanford 2024): Hierarchical abstractive summarization
 * - GraphRAG (Microsoft 2024): Entity-based knowledge graphs
 * - Contextual Retrieval (Anthropic 2024): BM25 + embeddings hybrid
 * 
 * @module advanced-memory
 */

import type { Memory, MemoryType } from './interfaces';

// ============================================================================
// Temporal Memory - Time-aware retrieval with decay
// ============================================================================

/**
 * Memory with temporal awareness for time-based decay and retrieval.
 * Based on MemGPT's temporal weighting system.
 */
export interface TemporalMemory extends Memory {
  /** When this memory was first created */
  createdAt: number;
  
  /** When this memory was last accessed/referenced */
  lastAccessedAt: number;
  
  /** Number of times this memory has been accessed */
  accessCount: number;
  
  /** Calculated recency score (0-1) based on decay function */
  recencyScore?: number;
  
  /** Time-weighted relevance combining recency and importance */
  temporalRelevance?: number;
  
  /** Optional expiration timestamp (Unix ms) - memory becomes inactive after */
  expiresAt?: number;
  
  /** Decay rate override (higher = faster decay, default 0.99) */
  decayRate?: number;
}

/**
 * Temporal decay configuration for memory retrieval.
 */
export interface TemporalDecayConfig {
  /** Base decay rate per hour (default: 0.99 = 1% decay/hour) */
  hourlyDecayRate: number;
  
  /** Minimum recency score (memories never fully decay, default: 0.1) */
  minRecency: number;
  
  /** Access count boost factor (higher access = slower decay) */
  accessBoostFactor: number;
  
  /** Importance boost factor (higher importance = slower decay) */
  importanceBoostFactor: number;
}

// ============================================================================
// Episodic Memory - Conversation and session tracking
// ============================================================================

/**
 * An episode represents a bounded interaction session or conversation.
 * Based on Generative Agents episodic memory system.
 */
export interface Episode {
  id: string;
  
  /** Human-readable title for the episode */
  title: string;
  
  /** Brief summary generated after episode ends */
  summary?: string;
  
  /** Session or conversation ID this episode belongs to */
  sessionId?: string;
  
  /** IDs of memories created during this episode */
  memoryIds: string[];
  
  /** Key entities mentioned in this episode */
  entities: string[];
  
  /** Key topics discussed */
  topics: string[];
  
  /** Emotional tone/sentiment (if detected) */
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  
  /** Episode start timestamp */
  startedAt: number;
  
  /** Episode end timestamp (undefined if ongoing) */
  endedAt?: number;
  
  /** Whether episode is currently active */
  isActive: boolean;
  
  /** Parent episode ID for nested conversations */
  parentEpisodeId?: string;
  
  /** Episode-level importance (0-1) */
  importance: number;
  
  /** Embedding of the episode summary for semantic retrieval */
  embedding?: number[];
}

/**
 * Options for querying episodic memory.
 */
export interface EpisodeQueryOptions {
  /** Filter by session ID */
  sessionId?: string;
  
  /** Include only active episodes */
  activeOnly?: boolean;
  
  /** Filter by time range */
  startAfter?: number;
  endBefore?: number;
  
  /** Filter by minimum importance */
  minImportance?: number;
  
  /** Limit results */
  limit?: number;
}

// ============================================================================
// Working Memory - Active context window (MemGPT pattern)
// ============================================================================

/**
 * Working memory entry - active context that doesn't persist permanently.
 * Based on MemGPT's working memory buffer concept.
 */
export interface WorkingMemoryEntry {
  id: string;
  
  /** Content of the working memory entry */
  content: string;
  
  /** Role in conversation (system, user, assistant, tool) */
  role: 'system' | 'user' | 'assistant' | 'tool';
  
  /** Associated tool call ID if role is 'tool' */
  toolCallId?: string;
  
  /** When this entry was added to working memory */
  addedAt: number;
  
  /** Token count for this entry (for budget management) */
  tokenCount: number;
  
  /** Priority for eviction (higher = keep longer) */
  priority: number;
  
  /** Whether this entry is pinned (never auto-evicted) */
  pinned: boolean;
  
  /** Source memory ID if promoted from long-term memory */
  sourceMemoryId?: string;
}

/**
 * Working memory buffer state.
 */
export interface WorkingMemory {
  /** Current entries in working memory, ordered by recency */
  entries: WorkingMemoryEntry[];
  
  /** Maximum token budget for working memory */
  maxTokens: number;
  
  /** Current token usage */
  currentTokens: number;
  
  /** System prompt (always included, pinned) */
  systemPrompt?: string;
  
  /** Active episode ID */
  activeEpisodeId?: string;
  
  /** Recent entity references for context */
  recentEntities: string[];
  
  /** Last compaction timestamp */
  lastCompactedAt?: number;
}

/**
 * Working memory management options.
 */
export interface WorkingMemoryOptions {
  /** Maximum tokens allowed (default: 8000) */
  maxTokens?: number;
  
  /** When to trigger compaction (percentage of max, default: 0.9) */
  compactionThreshold?: number;
  
  /** Number of recent entries to always keep (default: 5) */
  minRecentEntries?: number;
  
  /** Whether to auto-archive evicted entries to long-term memory */
  archiveOnEviction?: boolean;
}

// ============================================================================
// Memory Clusters - RAPTOR hierarchical summarization
// ============================================================================

/**
 * A cluster of related memories with hierarchical summarization.
 * Based on RAPTOR's recursive abstractive processing.
 */
export interface MemoryCluster {
  id: string;
  
  /** Cluster label/topic */
  label: string;
  
  /** Abstractive summary of all memories in cluster */
  summary: string;
  
  /** IDs of memories in this cluster */
  memoryIds: string[];
  
  /** Parent cluster ID (for hierarchy) */
  parentClusterId?: string;
  
  /** Child cluster IDs */
  childClusterIds: string[];
  
  /** Hierarchy level (0 = leaf, higher = more abstract) */
  level: number;
  
  /** Centroid embedding for the cluster */
  centroidEmbedding?: number[];
  
  /** Cluster coherence score (how related the memories are) */
  coherenceScore: number;
  
  /** When cluster was created */
  createdAt: number;
  
  /** When cluster was last updated */
  updatedAt: number;
  
  /** Number of memories (including nested clusters) */
  totalMemoryCount: number;
}

/**
 * Options for clustering memories.
 */
export interface ClusteringOptions {
  /** Minimum similarity for grouping (default: 0.7) */
  minSimilarity?: number;
  
  /** Minimum cluster size (default: 3) */
  minClusterSize?: number;
  
  /** Maximum hierarchy depth (default: 3) */
  maxDepth?: number;
  
  /** Whether to regenerate summaries (default: false) */
  regenerateSummaries?: boolean;
}

// ============================================================================
// Reflections - Generative Agents pattern
// ============================================================================

/**
 * A reflection is a higher-order insight derived from multiple memories.
 * Based on Generative Agents reflection mechanism.
 */
export interface Reflection {
  id: string;
  
  /** The reflection content (insight, belief, pattern) */
  content: string;
  
  /** Type of reflection */
  type: ReflectionType;
  
  /** IDs of memories that led to this reflection */
  sourceMemoryIds: string[];
  
  /** Confidence in this reflection (0-1) */
  confidence: number;
  
  /** Number of supporting evidences */
  evidenceCount: number;
  
  /** Questions or uncertainties this reflection raises */
  openQuestions?: string[];
  
  /** When reflection was generated */
  createdAt: number;
  
  /** When reflection was last validated/updated */
  validatedAt?: number;
  
  /** Whether reflection has been contradicted */
  isContradicted: boolean;
  
  /** ID of contradicting reflection if any */
  contradictedById?: string;
  
  /** Embedding for semantic retrieval */
  embedding?: number[];
}

export type ReflectionType = 
  | 'belief'      // Inferred belief about the world/user
  | 'pattern'     // Observed pattern in behavior/data
  | 'preference'  // Inferred user preference
  | 'goal'        // Inferred user goal
  | 'constraint'  // Inferred constraint or limitation
  | 'summary'     // Summary of a topic area
  | 'insight';    // Novel insight or connection

/**
 * Options for generating reflections.
 */
export interface ReflectionOptions {
  /** Minimum memories needed to trigger reflection (default: 5) */
  minMemories?: number;
  
  /** Focus on specific memory types */
  focusTypes?: MemoryType[];
  
  /** Time window for memory consideration (ms) */
  timeWindow?: number;
  
  /** Whether to check for contradictions */
  checkContradictions?: boolean;
}

// ============================================================================
// Entity Graph - GraphRAG pattern
// ============================================================================

/**
 * An entity extracted from memories for knowledge graph.
 * Based on GraphRAG entity extraction.
 */
export interface Entity {
  id: string;
  
  /** Entity name (normalized) */
  name: string;
  
  /** Entity type */
  type: EntityType;
  
  /** Description synthesized from mentions */
  description?: string;
  
  /** Aliases and alternate names */
  aliases: string[];
  
  /** IDs of memories mentioning this entity */
  mentionedInMemoryIds: string[];
  
  /** Number of mentions */
  mentionCount: number;
  
  /** First seen timestamp */
  firstSeenAt: number;
  
  /** Last seen timestamp */
  lastSeenAt: number;
  
  /** Importance score based on mentions and relations */
  importance: number;
  
  /** Embedding for the entity */
  embedding?: number[];
  
  /** Structured attributes */
  attributes: Record<string, unknown>;
}

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'concept'
  | 'tool'
  | 'project'
  | 'file'
  | 'technology'
  | 'event'
  | 'custom';

/**
 * A relation between two entities.
 */
export interface EntityRelation {
  id: string;
  
  /** Source entity ID */
  sourceEntityId: string;
  
  /** Target entity ID */
  targetEntityId: string;
  
  /** Relation type */
  relationType: RelationType;
  
  /** Relation description */
  description?: string;
  
  /** Strength/confidence of relation (0-1) */
  strength: number;
  
  /** IDs of memories supporting this relation */
  sourceMemoryIds: string[];
  
  /** When relation was first established */
  createdAt: number;
  
  /** When relation was last reinforced */
  lastReinforcedAt: number;
}

export type RelationType =
  | 'works_at'
  | 'works_on'
  | 'created_by'
  | 'uses'
  | 'depends_on'
  | 'related_to'
  | 'part_of'
  | 'located_in'
  | 'happened_at'
  | 'prefers'
  | 'dislikes'
  | 'custom';

/**
 * Options for entity graph queries.
 */
export interface EntityQueryOptions {
  /** Entity types to include */
  types?: EntityType[];
  
  /** Minimum importance */
  minImportance?: number;
  
  /** Include relations */
  includeRelations?: boolean;
  
  /** Max hops for relation traversal */
  maxHops?: number;
  
  /** Limit results */
  limit?: number;
}

// ============================================================================
// Contradiction Detection - BDI Agent pattern
// ============================================================================

/**
 * A detected contradiction between memories or reflections.
 */
export interface Contradiction {
  id: string;
  
  /** First conflicting item ID (memory or reflection) */
  itemAId: string;
  itemAType: 'memory' | 'reflection';
  
  /** Second conflicting item ID */
  itemBId: string;
  itemBType: 'memory' | 'reflection';
  
  /** Description of the contradiction */
  description: string;
  
  /** Contradiction type */
  type: ContradictionType;
  
  /** Severity (0-1) */
  severity: number;
  
  /** Resolution status */
  status: ContradictionStatus;
  
  /** Resolution description if resolved */
  resolution?: string;
  
  /** ID of winning item if resolved by selection */
  resolvedInFavorOf?: string;
  
  /** When contradiction was detected */
  detectedAt: number;
  
  /** When contradiction was resolved */
  resolvedAt?: number;
}

export type ContradictionType =
  | 'factual'      // Contradicting facts
  | 'preference'   // Contradicting preferences
  | 'temporal'     // Time-based contradiction (old vs new)
  | 'logical';     // Logical inconsistency

export type ContradictionStatus =
  | 'unresolved'
  | 'resolved_newer'  // Newer information preferred
  | 'resolved_older'  // Older information preferred
  | 'resolved_merged' // Both reconciled
  | 'acknowledged';   // Noted but not resolved

// ============================================================================
// Memory Provenance - Trust and source tracking
// ============================================================================

/**
 * Provenance tracking for memory trustworthiness.
 */
export interface MemoryProvenance {
  memoryId: string;
  
  /** Source type */
  sourceType: ProvenanceSource;
  
  /** Specific source identifier */
  sourceId?: string;
  
  /** Source name/description */
  sourceName?: string;
  
  /** Trust score (0-1) */
  trustScore: number;
  
  /** Whether this memory has been verified */
  verified: boolean;
  
  /** Verification method if verified */
  verificationMethod?: string;
  
  /** Who/what verified this memory */
  verifiedBy?: string;
  
  /** When provenance was recorded */
  recordedAt: number;
}

export type ProvenanceSource =
  | 'user_stated'    // User explicitly stated this
  | 'user_confirmed' // User confirmed when asked
  | 'inferred'       // Inferred by the system
  | 'tool_result'    // Result from a tool call
  | 'document'       // Extracted from a document
  | 'external_api'   // From an external API
  | 'reflection';    // Generated through reflection

// ============================================================================
// Forgetting Policy - Intelligent memory management
// ============================================================================

/**
 * Policy for automatic memory forgetting/archival.
 */
export interface ForgettingPolicy {
  id: string;
  
  /** Policy name */
  name: string;
  
  /** Whether policy is active */
  enabled: boolean;
  
  /** Conditions that trigger forgetting */
  conditions: ForgettingCondition[];
  
  /** Action to take when conditions met */
  action: ForgettingAction;
  
  /** Memory types this policy applies to */
  applicableTypes?: MemoryType[];
  
  /** Tags that exempt memories from this policy */
  exemptTags?: string[];
  
  /** Minimum importance to exempt */
  minImportanceExemption?: number;
  
  /** Last execution time */
  lastRunAt?: number;
  
  /** Created timestamp */
  createdAt: number;
}

export interface ForgettingCondition {
  /** Condition type */
  type: 'age' | 'access_count' | 'importance' | 'recency_score';
  
  /** Comparison operator */
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  
  /** Threshold value */
  value: number;
}

export type ForgettingAction =
  | 'archive'    // Move to archival storage
  | 'summarize'  // Compress into summary
  | 'delete'     // Permanently remove
  | 'demote';    // Lower importance score

// ============================================================================
// Contextual Retrieval - Anthropic's BM25 + Embedding pattern
// ============================================================================

/**
 * Options for contextual retrieval combining multiple strategies.
 */
export interface ContextualRetrievalOptions {
  /** Natural language query */
  query: string;
  
  /** Maximum results to return */
  limit?: number;
  
  /** Minimum combined score threshold */
  minScore?: number;
  
  /** Weight for semantic similarity (0-1, default 0.5) */
  semanticWeight?: number;
  
  /** Weight for BM25 text match (0-1, default 0.3) */
  bm25Weight?: number;
  
  /** Weight for temporal recency (0-1, default 0.2) */
  recencyWeight?: number;
  
  /** Whether to include entity graph context */
  includeEntityContext?: boolean;
  
  /** Whether to include relevant reflections */
  includeReflections?: boolean;
  
  /** Filter by memory types */
  types?: MemoryType[];
  
  /** Filter by tags */
  tags?: string[];
  
  /** Time window (only consider memories from last N ms) */
  timeWindow?: number;
  
  /** Active task context for task-aware retrieval */
  taskContext?: string;
}

/**
 * Rich retrieval result with multiple relevance signals.
 */
export interface ContextualRetrievalResult {
  memory: Memory;
  
  /** Combined relevance score */
  score: number;
  
  /** Individual score components */
  scores: {
    semantic: number;
    bm25: number;
    recency: number;
    importance: number;
    taskRelevance?: number;
  };
  
  /** Related entities found */
  relatedEntities?: Entity[];
  
  /** Related reflections */
  relatedReflections?: Reflection[];
  
  /** Episode context if available */
  episodeContext?: {
    episodeId: string;
    episodeTitle: string;
    positionInEpisode: number;
  };
  
  /** Explanation of why this was retrieved */
  retrievalReason?: string;
}

// ============================================================================
// Advanced Memory Service Interface
// ============================================================================

/**
 * Advanced Memory Service with state-of-the-art capabilities.
 */
export interface IAdvancedMemoryService {
  // === Temporal Memory ===
  /** Store memory with temporal tracking */
  storeWithTemporal(input: TemporalMemoryInput): Promise<TemporalMemory>;
  
  /** Get memories with temporal decay applied */
  getWithDecay(options: TemporalQueryOptions): Promise<TemporalMemory[]>;
  
  /** Configure temporal decay parameters */
  setDecayConfig(config: Partial<TemporalDecayConfig>): void;
  
  // === Episodic Memory ===
  /** Start a new episode */
  startEpisode(title: string, sessionId?: string): Promise<Episode>;
  
  /** End current episode and generate summary */
  endEpisode(episodeId: string): Promise<Episode>;
  
  /** Add memory to current episode */
  addToEpisode(memoryId: string, episodeId: string): Promise<void>;
  
  /** Query episodes */
  queryEpisodes(options: EpisodeQueryOptions): Promise<Episode[]>;
  
  /** Recall memories from a specific episode */
  recallEpisode(episodeId: string): Promise<Memory[]>;
  
  // === Working Memory ===
  /** Get current working memory state */
  getWorkingMemory(): WorkingMemory;
  
  /** Add entry to working memory */
  addToWorkingMemory(entry: Omit<WorkingMemoryEntry, 'id' | 'addedAt'>): WorkingMemoryEntry;
  
  /** Remove entry from working memory */
  removeFromWorkingMemory(entryId: string): void;
  
  /** Compact working memory (summarize and archive old entries) */
  compactWorkingMemory(): Promise<void>;
  
  /** Promote relevant long-term memories to working memory */
  promoteToWorkingMemory(query: string, limit?: number): Promise<WorkingMemoryEntry[]>;
  
  // === Clustering & Hierarchy ===
  /** Cluster memories into hierarchical groups */
  clusterMemories(options?: ClusteringOptions): Promise<MemoryCluster[]>;
  
  /** Get cluster hierarchy */
  getClusterHierarchy(): Promise<MemoryCluster[]>;
  
  /** Query by cluster */
  queryByCluster(clusterId: string): Promise<Memory[]>;
  
  // === Reflections ===
  /** Generate reflections from recent memories */
  generateReflections(options?: ReflectionOptions): Promise<Reflection[]>;
  
  /** Get reflections by type */
  getReflections(type?: ReflectionType): Promise<Reflection[]>;
  
  /** Check memory against existing reflections for contradictions */
  checkContradictions(memoryId: string): Promise<Contradiction[]>;
  
  // === Entity Graph ===
  /** Extract entities from memory content */
  extractEntities(memoryId: string): Promise<Entity[]>;
  
  /** Query entities */
  queryEntities(options: EntityQueryOptions): Promise<Entity[]>;
  
  /** Get entity relations */
  getEntityRelations(entityId: string): Promise<EntityRelation[]>;
  
  /** Find path between entities */
  findEntityPath(fromEntityId: string, toEntityId: string, maxHops?: number): Promise<EntityRelation[]>;
  
  // === Contextual Retrieval ===
  /** Advanced retrieval combining multiple strategies */
  contextualRetrieve(options: ContextualRetrievalOptions): Promise<ContextualRetrievalResult[]>;
  
  /** Build context window for LLM with intelligent selection */
  buildContextWindow(query: string, maxTokens: number): Promise<string>;
  
  // === Memory Management ===
  /** Get contradictions */
  getContradictions(status?: ContradictionStatus): Promise<Contradiction[]>;
  
  /** Resolve contradiction */
  resolveContradiction(id: string, resolution: ContradictionStatus, notes?: string): Promise<void>;
  
  /** Apply forgetting policies */
  applyForgettingPolicies(): Promise<{ archived: number; deleted: number; summarized: number }>;
  
  /** Set memory provenance */
  setProvenance(memoryId: string, provenance: Omit<MemoryProvenance, 'memoryId' | 'recordedAt'>): Promise<void>;
  
  /** Get memory provenance */
  getProvenance(memoryId: string): Promise<MemoryProvenance | null>;
}

// ============================================================================
// Input Types
// ============================================================================

export interface TemporalMemoryInput {
  content: string;
  type?: MemoryType;
  importance?: number;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: number;
  decayRate?: number;
}

export interface TemporalQueryOptions {
  /** Apply temporal decay to scores */
  applyDecay?: boolean;
  
  /** Minimum recency score after decay */
  minRecency?: number;
  
  /** Filter by types */
  types?: MemoryType[];
  
  /** Include expired memories */
  includeExpired?: boolean;
  
  /** Limit results */
  limit?: number;
}
