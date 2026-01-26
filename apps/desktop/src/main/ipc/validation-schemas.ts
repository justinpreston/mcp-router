/**
 * Zod validation schemas for IPC handlers.
 * All IPC input should be validated before processing.
 */
import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

/** Non-empty string with max length */
export const NonEmptyString = z.string().min(1).max(1000);

/** Server ID pattern (nanoid format) */
export const ServerId = z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid server ID format');

/** Token ID pattern (mcpr_ prefix + nanoid) */
export const TokenId = z.string().regex(/^mcpr_[A-Za-z0-9_-]{21}$/, 'Invalid token ID format');

/** Workspace ID pattern */
export const WorkspaceId = z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid workspace ID format');

/** Policy ID pattern */
export const PolicyId = z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid policy ID format');

/** URL validation */
export const HttpUrl = z.string().url().startsWith('http', 'URL must use http or https protocol');

/** File path validation (no traversal) */
export const SafeFilePath = z.string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes('..'), 'Path traversal not allowed')
  .refine((path) => !path.includes('\0'), 'Null bytes not allowed');

// ============================================================================
// Server Schemas
// ============================================================================

export const ServerTypeSchema = z.enum(['stdio', 'http', 'sse']);

export const ServerCreateSchema = z.object({
  name: NonEmptyString.max(100),
  command: NonEmptyString.max(1000),
  args: z.array(z.string().max(1000)).max(50).default([]),
  env: z.record(z.string().max(100), z.string().max(10000)).optional(),
  type: ServerTypeSchema.default('stdio'),
  url: HttpUrl.optional(),
  workspaceId: WorkspaceId.optional(),
  autoStart: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const ServerUpdateSchema = z.object({
  id: ServerId,
  name: NonEmptyString.max(100).optional(),
  command: NonEmptyString.max(1000).optional(),
  args: z.array(z.string().max(1000)).max(50).optional(),
  env: z.record(z.string().max(100), z.string().max(10000)).optional(),
  autoStart: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const ServerStartSchema = z.object({
  id: ServerId,
});

export const ServerStopSchema = z.object({
  id: ServerId,
});

// ============================================================================
// Token Schemas
// ============================================================================

export const TokenCreateSchema = z.object({
  name: NonEmptyString.max(100),
  clientId: NonEmptyString.max(100),
  expiresInDays: z.number().int().min(1).max(365).default(30),
  serverAccess: z.array(ServerId).max(100).optional(),
  workspaceId: WorkspaceId.optional(),
  scopes: z.array(z.string().max(50)).max(50).optional(),
});

export const TokenRevokeSchema = z.object({
  id: TokenId,
});

export const TokenRefreshSchema = z.object({
  id: TokenId,
  expiresInDays: z.number().int().min(1).max(365).default(30),
});

export const TokenUpdateAccessSchema = z.object({
  id: TokenId,
  serverAccess: z.array(ServerId).max(100),
});

// ============================================================================
// Policy Schemas
// ============================================================================

export const PolicyEffectSchema = z.enum(['allow', 'deny', 'require_approval']);

export const PolicyCreateSchema = z.object({
  name: NonEmptyString.max(100),
  description: z.string().max(1000).optional(),
  effect: PolicyEffectSchema,
  priority: z.number().int().min(0).max(1000).default(0),
  conditions: z.object({
    servers: z.array(ServerId).max(100).optional(),
    tools: z.array(z.string().max(100)).max(100).optional(),
    clients: z.array(z.string().max(100)).max(100).optional(),
    timeWindows: z.array(z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
      days: z.array(z.number().int().min(0).max(6)).optional(),
    })).max(10).optional(),
  }).optional(),
  workspaceId: WorkspaceId.optional(),
});

export const PolicyUpdateSchema = z.object({
  id: PolicyId,
  name: NonEmptyString.max(100).optional(),
  description: z.string().max(1000).optional(),
  effect: PolicyEffectSchema.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  conditions: z.object({
    servers: z.array(ServerId).max(100).optional(),
    tools: z.array(z.string().max(100)).max(100).optional(),
    clients: z.array(z.string().max(100)).max(100).optional(),
  }).optional(),
});

export const PolicyDeleteSchema = z.object({
  id: PolicyId,
});

// ============================================================================
// Approval Schemas
// ============================================================================

export const ApprovalIdSchema = z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid approval ID');

export const ApprovalDecisionSchema = z.object({
  id: ApprovalIdSchema,
  decision: z.enum(['approved', 'denied']),
  reason: z.string().max(1000).optional(),
});

// ============================================================================
// Workspace Schemas
// ============================================================================

export const WorkspaceCreateSchema = z.object({
  name: NonEmptyString.max(100),
  description: z.string().max(1000).optional(),
  rootPath: SafeFilePath.optional(),
});

export const WorkspaceUpdateSchema = z.object({
  id: WorkspaceId,
  name: NonEmptyString.max(100).optional(),
  description: z.string().max(1000).optional(),
});

export const WorkspaceDeleteSchema = z.object({
  id: WorkspaceId,
});

// ============================================================================
// Memory Schemas
// ============================================================================

export const MemoryKeySchema = z.string().min(1).max(500);

export const MemorySetSchema = z.object({
  key: MemoryKeySchema,
  value: z.unknown(), // Allow any JSON-serializable value
  namespace: z.string().max(100).optional(),
  ttl: z.number().int().min(0).max(86400 * 365).optional(), // Max 1 year TTL
});

export const MemoryGetSchema = z.object({
  key: MemoryKeySchema,
  namespace: z.string().max(100).optional(),
});

export const MemoryDeleteSchema = z.object({
  key: MemoryKeySchema,
  namespace: z.string().max(100).optional(),
});

// ============================================================================
// Catalog Schemas
// ============================================================================

export const CatalogSearchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  filters: z.object({
    servers: z.array(ServerId).max(50).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
  }).optional(),
});

export const ToolNameSchema = z.string().min(1).max(200);

export const CatalogToolActionSchema = z.object({
  serverId: ServerId,
  toolName: ToolNameSchema,
});

// ============================================================================
// Policy Schemas (for policies.handler.ts)
// ============================================================================

export const PolicyScopeSchema = z.enum(['global', 'workspace', 'server', 'client']);
export const ResourceTypeSchema = z.enum(['tool', 'server', 'resource']);
export const PolicyActionSchema = z.enum(['allow', 'deny', 'require_approval']);

export const PolicyAddConfigSchema = z.object({
  name: NonEmptyString.max(100),
  description: z.string().max(1000).optional(),
  scope: PolicyScopeSchema,
  scopeId: z.string().max(100).optional(),
  resourceType: ResourceTypeSchema,
  pattern: NonEmptyString.max(500),
  action: PolicyActionSchema,
  priority: z.number().int().min(0).max(1000).default(0),
  enabled: z.boolean().default(true),
});

export const PolicyUpdateConfigSchema = z.object({
  name: NonEmptyString.max(100).optional(),
  description: z.string().max(1000).optional(),
  scope: PolicyScopeSchema.optional(),
  scopeId: z.string().max(100).optional(),
  resourceType: ResourceTypeSchema.optional(),
  pattern: NonEmptyString.max(500).optional(),
  action: PolicyActionSchema.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
});

export const PolicyListSchema = z.object({
  scope: PolicyScopeSchema.optional(),
  scopeId: z.string().max(100).optional(),
});

// ============================================================================
// Memory Schemas (extended for memory.handler.ts)
// ============================================================================

export const MemoryIdSchema = z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid memory ID');

export const MemoryStoreSchema = z.object({
  content: NonEmptyString.max(100000), // Max 100KB content
  tags: z.array(z.string().max(50)).max(50).optional(),
  source: z.string().max(500).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export const MemoryUpdateInputSchema = z.object({
  content: NonEmptyString.max(100000).optional(),
  tags: z.array(z.string().max(50)).max(50).optional(),
  source: z.string().max(500).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export const MemorySearchQuerySchema = z.object({
  query: NonEmptyString.max(500),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  tags: z.array(z.string().max(50)).max(50).optional(),
});

export const MemorySearchByTagsSchema = z.object({
  tags: z.array(z.string().max(50)).min(1).max(50),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const MemoryListOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// Workspace Schemas (extended)
// ============================================================================

export const WorkspaceServerActionSchema = z.object({
  workspaceId: WorkspaceId,
  serverId: ServerId,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate and parse input with a Zod schema.
 * Throws a formatted error if validation fails.
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Validation failed: ${errors.join('; ')}`);
  }
  return result.data;
}

/**
 * Create a validation wrapper for IPC handlers.
 */
export function withValidation<T, R>(
  schema: z.ZodSchema<T>,
  handler: (data: T) => Promise<R>
): (input: unknown) => Promise<R> {
  return async (input: unknown) => {
    const validated = validateInput(schema, input);
    return handler(validated);
  };
}
