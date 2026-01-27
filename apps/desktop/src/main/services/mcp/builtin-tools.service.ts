import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IBuiltinToolsService,
  IMemoryService,
  ILogger,
  MCPTool,
  BuiltinToolResult,
  MemoryType,
} from '@main/core/interfaces';
import type {
  IAdvancedMemoryService,
} from '@main/core/advanced-memory.types';

/**
 * Built-in MCP tools that are exposed alongside external server tools.
 * These provide access to MCP Router's internal capabilities like memory.
 */
@injectable()
export class BuiltinToolsService implements IBuiltinToolsService {
  /** Server ID used for built-in tools */
  private readonly serverId = '_builtin';
  private readonly serverName = 'MCP Router';

  /** Tool definitions */
  private readonly tools: MCPTool[] = [
    {
      name: 'memory_store',
      description: 'Store a new memory in the knowledge base. Use this to remember facts, preferences, instructions, or context for future interactions.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The content to store as a memory',
          },
          type: {
            type: 'string',
            enum: ['fact', 'preference', 'instruction', 'context', 'note'],
            description: 'The type of memory. "instruction" for standing orders, "preference" for user preferences, "fact" for factual info, "context" for situational info, "note" for general notes.',
            default: 'note',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to categorize the memory',
          },
          importance: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Importance score from 0 to 1. Higher values are prioritized in search results.',
            default: 0.5,
          },
          source: {
            type: 'string',
            description: 'Source or origin of this memory (e.g., "conversation", "user input")',
          },
        },
        required: ['content'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_search',
      description: 'Search memories using semantic similarity. Returns memories most relevant to the query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant memories',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            description: 'Maximum number of results to return',
            default: 10,
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['fact', 'preference', 'instruction', 'context', 'note'],
            },
            description: 'Filter by memory types',
          },
          min_similarity: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Minimum similarity score (0-1) for results',
            default: 0.3,
          },
        },
        required: ['query'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_retrieve',
      description: 'Retrieve a specific memory by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the memory to retrieve',
          },
        },
        required: ['id'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_list',
      description: 'List memories with optional filtering by tags or types.',
      inputSchema: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags (memories must have at least one of these tags)',
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['fact', 'preference', 'instruction', 'context', 'note'],
            },
            description: 'Filter by memory types',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            description: 'Maximum number of memories to return',
            default: 20,
          },
        },
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_delete',
      description: 'Delete a memory by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the memory to delete',
          },
        },
        required: ['id'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    // ========================================================================
    // Advanced Memory Tools (State-of-the-Art AI Agent Memory)
    // ========================================================================
    {
      name: 'memory_context',
      description: 'Advanced contextual retrieval combining semantic search, text matching, and temporal relevance. Returns the most relevant memories with multiple relevance signals.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find contextually relevant memories',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            description: 'Maximum number of results to return',
            default: 10,
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['fact', 'preference', 'instruction', 'context', 'note'],
            },
            description: 'Filter by memory types',
          },
          include_entities: {
            type: 'boolean',
            description: 'Include related entities in the results',
            default: true,
          },
          include_reflections: {
            type: 'boolean',
            description: 'Include related reflections/insights in the results',
            default: true,
          },
          time_window_hours: {
            type: 'number',
            description: 'Only consider memories from the last N hours',
          },
        },
        required: ['query'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_episode_start',
      description: 'Start a new episode to track a conversation or interaction session. Episodes group related memories together.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A descriptive title for this episode',
          },
          session_id: {
            type: 'string',
            description: 'Optional session identifier to link episodes',
          },
        },
        required: ['title'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_episode_end',
      description: 'End the current episode. This generates a summary and extracts key entities and topics.',
      inputSchema: {
        type: 'object',
        properties: {
          episode_id: {
            type: 'string',
            description: 'The ID of the episode to end',
          },
        },
        required: ['episode_id'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_episode_recall',
      description: 'Recall all memories from a specific episode or conversation.',
      inputSchema: {
        type: 'object',
        properties: {
          episode_id: {
            type: 'string',
            description: 'The ID of the episode to recall',
          },
        },
        required: ['episode_id'],
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_reflect',
      description: 'Generate reflections and insights from recent memories. Identifies patterns, beliefs, and preferences.',
      inputSchema: {
        type: 'object',
        properties: {
          time_window_hours: {
            type: 'number',
            description: 'Consider memories from the last N hours',
            default: 24,
          },
          focus_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['fact', 'preference', 'instruction', 'context', 'note'],
            },
            description: 'Focus on specific memory types',
          },
          check_contradictions: {
            type: 'boolean',
            description: 'Check for contradictions with existing reflections',
            default: true,
          },
        },
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_entity_query',
      description: 'Query the entity knowledge graph extracted from memories. Find people, concepts, tools, and their relationships.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['person', 'organization', 'location', 'concept', 'tool', 'project', 'file', 'technology', 'event', 'custom'],
            },
            description: 'Filter by entity types',
          },
          min_importance: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Minimum importance score',
            default: 0.3,
          },
          include_relations: {
            type: 'boolean',
            description: 'Include relationships between entities',
            default: true,
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            description: 'Maximum entities to return',
            default: 20,
          },
        },
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
    {
      name: 'memory_working',
      description: 'Get or manage the working memory buffer - the active context window for the current session.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'add', 'clear', 'promote'],
            description: 'Action to perform: get current state, add entry, clear buffer, or promote relevant memories',
            default: 'get',
          },
          content: {
            type: 'string',
            description: 'Content to add (when action is "add")',
          },
          query: {
            type: 'string',
            description: 'Query to find relevant memories to promote (when action is "promote")',
          },
          role: {
            type: 'string',
            enum: ['system', 'user', 'assistant', 'tool'],
            description: 'Role for the entry (when action is "add")',
            default: 'assistant',
          },
        },
      },
      serverId: this.serverId,
      serverName: this.serverName,
    },
  ];

  /** Map of tool names for quick lookup */
  private readonly toolNames: Set<string>;

  constructor(
    @inject(TYPES.MemoryService) private memoryService: IMemoryService,
    @inject(TYPES.AdvancedMemoryService) private advancedMemoryService: IAdvancedMemoryService,
    @inject(TYPES.Logger) private logger: ILogger
  ) {
    this.toolNames = new Set(this.tools.map((t) => t.name));
    this.logger.info('BuiltinToolsService initialized', {
      toolCount: this.tools.length,
      tools: Array.from(this.toolNames),
    });
  }

  /**
   * Get all built-in tools.
   */
  getTools(): MCPTool[] {
    return [...this.tools];
  }

  /**
   * Check if a tool name is a built-in tool.
   */
  isBuiltinTool(toolName: string): boolean {
    return this.toolNames.has(toolName);
  }

  /**
   * Execute a built-in tool.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    this.logger.debug('Calling built-in tool', { toolName, args });

    try {
      switch (toolName) {
        case 'memory_store':
          return await this.handleMemoryStore(args);
        case 'memory_search':
          return await this.handleMemorySearch(args);
        case 'memory_retrieve':
          return await this.handleMemoryRetrieve(args);
        case 'memory_list':
          return await this.handleMemoryList(args);
        case 'memory_delete':
          return await this.handleMemoryDelete(args);
        // Advanced memory tools
        case 'memory_context':
          return await this.handleMemoryContext(args);
        case 'memory_episode_start':
          return await this.handleEpisodeStart(args);
        case 'memory_episode_end':
          return await this.handleEpisodeEnd(args);
        case 'memory_episode_recall':
          return await this.handleEpisodeRecall(args);
        case 'memory_reflect':
          return await this.handleMemoryReflect(args);
        case 'memory_entity_query':
          return await this.handleEntityQuery(args);
        case 'memory_working':
          return await this.handleWorkingMemory(args);
        default:
          return {
            success: false,
            error: `Unknown built-in tool: ${toolName}`,
          };
      }
    } catch (error) {
      this.logger.error('Built-in tool execution failed', {
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  /**
   * Handle memory_store tool.
   */
  private async handleMemoryStore(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const content = args.content as string;
    if (!content || typeof content !== 'string') {
      return { success: false, error: 'content is required and must be a string' };
    }

    const memory = await this.memoryService.store({
      content,
      type: (args.type as MemoryType) || 'note',
      tags: Array.isArray(args.tags) ? args.tags : undefined,
      importance: typeof args.importance === 'number' ? args.importance : undefined,
      source: typeof args.source === 'string' ? args.source : 'mcp_tool',
    });

    return {
      success: true,
      result: {
        id: memory.id,
        content: memory.content,
        type: memory.type,
        tags: memory.tags,
        importance: memory.importance,
        createdAt: memory.createdAt,
      },
    };
  }

  /**
   * Handle memory_search tool.
   */
  private async handleMemorySearch(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const query = args.query as string;
    if (!query || typeof query !== 'string') {
      return { success: false, error: 'query is required and must be a string' };
    }

    const results = await this.memoryService.searchSemantic({
      query,
      limit: typeof args.limit === 'number' ? args.limit : 10,
      minSimilarity: typeof args.min_similarity === 'number' ? args.min_similarity : 0.3,
      types: Array.isArray(args.types) ? (args.types as MemoryType[]) : undefined,
    });

    return {
      success: true,
      result: {
        count: results.length,
        memories: results.map((r) => ({
          id: r.memory.id,
          content: r.memory.content,
          type: r.memory.type,
          tags: r.memory.tags,
          importance: r.memory.importance,
          similarity: r.score,
          createdAt: r.memory.createdAt,
        })),
      },
    };
  }

  /**
   * Handle memory_retrieve tool.
   */
  private async handleMemoryRetrieve(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const id = args.id as string;
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'id is required and must be a string' };
    }

    const memory = await this.memoryService.retrieve(id);
    if (!memory) {
      return { success: false, error: `Memory not found: ${id}` };
    }

    return {
      success: true,
      result: {
        id: memory.id,
        content: memory.content,
        type: memory.type,
        tags: memory.tags,
        importance: memory.importance,
        source: memory.source,
        metadata: memory.metadata,
        accessCount: memory.accessCount,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        lastAccessedAt: memory.lastAccessedAt,
      },
    };
  }

  /**
   * Handle memory_list tool.
   */
  private async handleMemoryList(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 20;
    const tags = Array.isArray(args.tags) ? args.tags : undefined;
    const types = Array.isArray(args.types) ? (args.types as MemoryType[]) : undefined;

    let memories;
    if (tags && tags.length > 0) {
      memories = await this.memoryService.searchByTags(tags, {
        types,
        topK: limit,
      });
    } else {
      memories = await this.memoryService.getAll({ limit });
      // Filter by types if specified
      if (types && types.length > 0) {
        memories = memories.filter((m) => types.includes(m.type));
      }
    }

    return {
      success: true,
      result: {
        count: memories.length,
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          type: m.type,
          tags: m.tags,
          importance: m.importance,
          createdAt: m.createdAt,
        })),
      },
    };
  }

  /**
   * Handle memory_delete tool.
   */
  private async handleMemoryDelete(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const id = args.id as string;
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'id is required and must be a string' };
    }

    // Check if memory exists first
    const memory = await this.memoryService.retrieve(id);
    if (!memory) {
      return { success: false, error: `Memory not found: ${id}` };
    }

    await this.memoryService.delete(id);

    return {
      success: true,
      result: { deleted: true, id },
    };
  }

  // ==========================================================================
  // Advanced Memory Tool Handlers
  // ==========================================================================

  /**
   * Handle memory_context tool - contextual retrieval with multiple signals.
   */
  private async handleMemoryContext(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const query = args.query as string;
    if (!query || typeof query !== 'string') {
      return { success: false, error: 'query is required and must be a string' };
    }

    const results = await this.advancedMemoryService.contextualRetrieve({
      query,
      limit: typeof args.limit === 'number' ? args.limit : 10,
      types: Array.isArray(args.types) ? (args.types as MemoryType[]) : undefined,
      includeEntityContext: args.include_entities !== false,
      includeReflections: args.include_reflections !== false,
      timeWindow: typeof args.time_window_hours === 'number'
        ? args.time_window_hours * 60 * 60 * 1000
        : undefined,
    });

    return {
      success: true,
      result: {
        count: results.length,
        memories: results.map((r) => ({
          id: r.memory.id,
          content: r.memory.content,
          type: r.memory.type,
          tags: r.memory.tags,
          score: r.score,
          scores: r.scores,
          relatedEntities: r.relatedEntities?.map((e) => ({
            id: e.id,
            name: e.name,
            type: e.type,
            importance: e.importance,
          })),
          relatedReflections: r.relatedReflections?.map((ref) => ({
            id: ref.id,
            content: ref.content,
            type: ref.type,
            confidence: ref.confidence,
          })),
        })),
      },
    };
  }

  /**
   * Handle memory_episode_start tool.
   */
  private async handleEpisodeStart(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const title = args.title as string;
    if (!title || typeof title !== 'string') {
      return { success: false, error: 'title is required and must be a string' };
    }

    const sessionId = typeof args.session_id === 'string' ? args.session_id : undefined;
    const episode = await this.advancedMemoryService.startEpisode(title, sessionId);

    return {
      success: true,
      result: {
        id: episode.id,
        title: episode.title,
        sessionId: episode.sessionId,
        startedAt: episode.startedAt,
        isActive: episode.isActive,
      },
    };
  }

  /**
   * Handle memory_episode_end tool.
   */
  private async handleEpisodeEnd(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const episodeId = args.episode_id as string;
    if (!episodeId || typeof episodeId !== 'string') {
      return { success: false, error: 'episode_id is required and must be a string' };
    }

    const episode = await this.advancedMemoryService.endEpisode(episodeId);

    return {
      success: true,
      result: {
        id: episode.id,
        title: episode.title,
        summary: episode.summary,
        entities: episode.entities,
        topics: episode.topics,
        memoryCount: episode.memoryIds.length,
        startedAt: episode.startedAt,
        endedAt: episode.endedAt,
        importance: episode.importance,
      },
    };
  }

  /**
   * Handle memory_episode_recall tool.
   */
  private async handleEpisodeRecall(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const episodeId = args.episode_id as string;
    if (!episodeId || typeof episodeId !== 'string') {
      return { success: false, error: 'episode_id is required and must be a string' };
    }

    const memories = await this.advancedMemoryService.recallEpisode(episodeId);

    return {
      success: true,
      result: {
        episodeId,
        count: memories.length,
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          type: m.type,
          tags: m.tags,
          importance: m.importance,
          createdAt: m.createdAt,
        })),
      },
    };
  }

  /**
   * Handle memory_reflect tool - generate reflections from memories.
   */
  private async handleMemoryReflect(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const timeWindowHours = typeof args.time_window_hours === 'number' ? args.time_window_hours : 24;

    const reflections = await this.advancedMemoryService.generateReflections({
      timeWindow: timeWindowHours * 60 * 60 * 1000,
      focusTypes: Array.isArray(args.focus_types) ? (args.focus_types as MemoryType[]) : undefined,
      checkContradictions: args.check_contradictions !== false,
    });

    return {
      success: true,
      result: {
        count: reflections.length,
        reflections: reflections.map((r) => ({
          id: r.id,
          content: r.content,
          type: r.type,
          confidence: r.confidence,
          evidenceCount: r.evidenceCount,
          openQuestions: r.openQuestions,
          createdAt: r.createdAt,
        })),
      },
    };
  }

  /**
   * Handle memory_entity_query tool - query the knowledge graph.
   */
  private async handleEntityQuery(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const entities = await this.advancedMemoryService.queryEntities({
      types: Array.isArray(args.entity_types) ? args.entity_types as import('@main/core/advanced-memory.types').EntityType[] : undefined,
      minImportance: typeof args.min_importance === 'number' ? args.min_importance : 0.3,
      includeRelations: args.include_relations !== false,
      limit: typeof args.limit === 'number' ? args.limit : 20,
    });

    return {
      success: true,
      result: {
        count: entities.length,
        entities: entities.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          aliases: e.aliases,
          mentionCount: e.mentionCount,
          importance: e.importance,
          firstSeenAt: e.firstSeenAt,
          lastSeenAt: e.lastSeenAt,
          relations: (e as unknown as { relations?: Array<{ id: string; relationType: string; targetEntityId: string; sourceEntityId: string; strength: number }> }).relations?.map((r) => ({
            id: r.id,
            type: r.relationType,
            targetEntityId: r.targetEntityId,
            sourceEntityId: r.sourceEntityId,
            strength: r.strength,
          })),
        })),
      },
    };
  }

  /**
   * Handle memory_working tool - manage working memory buffer.
   */
  private async handleWorkingMemory(
    args: Record<string, unknown>
  ): Promise<BuiltinToolResult> {
    const action = (args.action as string) || 'get';

    switch (action) {
      case 'get': {
        const wm = this.advancedMemoryService.getWorkingMemory();
        return {
          success: true,
          result: {
            entryCount: wm.entries.length,
            currentTokens: wm.currentTokens,
            maxTokens: wm.maxTokens,
            activeEpisodeId: wm.activeEpisodeId,
            recentEntities: wm.recentEntities,
            entries: wm.entries.map((e) => ({
              id: e.id,
              role: e.role,
              content: e.content.slice(0, 200) + (e.content.length > 200 ? '...' : ''),
              tokenCount: e.tokenCount,
              priority: e.priority,
              pinned: e.pinned,
              addedAt: e.addedAt,
            })),
          },
        };
      }

      case 'add': {
        const content = args.content as string;
        if (!content || typeof content !== 'string') {
          return { success: false, error: 'content is required when action is "add"' };
        }
        const role = (args.role as 'system' | 'user' | 'assistant' | 'tool') || 'assistant';
        const entry = this.advancedMemoryService.addToWorkingMemory({
          content,
          role,
          tokenCount: Math.ceil(content.length / 4),
          priority: 5,
          pinned: false,
        });
        return {
          success: true,
          result: {
            added: true,
            entry: {
              id: entry.id,
              role: entry.role,
              tokenCount: entry.tokenCount,
              addedAt: entry.addedAt,
            },
          },
        };
      }

      case 'clear': {
        await this.advancedMemoryService.compactWorkingMemory();
        return {
          success: true,
          result: { cleared: true },
        };
      }

      case 'promote': {
        const query = args.query as string;
        if (!query || typeof query !== 'string') {
          return { success: false, error: 'query is required when action is "promote"' };
        }
        const promoted = await this.advancedMemoryService.promoteToWorkingMemory(query, 5);
        return {
          success: true,
          result: {
            promoted: promoted.length,
            entries: promoted.map((e) => ({
              id: e.id,
              content: e.content.slice(0, 100) + (e.content.length > 100 ? '...' : ''),
              sourceMemoryId: e.sourceMemoryId,
            })),
          },
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}
