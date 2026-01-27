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
  ];

  /** Map of tool names for quick lookup */
  private readonly toolNames: Set<string>;

  constructor(
    @inject(TYPES.MemoryService) private memoryService: IMemoryService,
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
}
