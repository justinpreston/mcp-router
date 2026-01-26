# ADR-006: Implement Policy-Based Access Control

## Status

Accepted

## Context

MCP Router aggregates multiple MCP servers, each exposing tools and resources. We need to control:
- Which clients can access which servers
- Which tools can be executed
- Which operations require human approval
- Rate limiting per client/token

Security requirements:
- Default deny for unknown operations
- Granular control at tool level
- Support for wildcard patterns
- Audit trail for all decisions

## Decision

We will implement a **policy-based access control** system with:
- Policy rules with pattern matching
- Priority-based rule evaluation
- Three actions: allow, deny, require_approval
- Scopes: global, client-specific, server-specific

## Consequences

### Positive

1. **Flexibility**: Can express complex access control requirements
2. **Auditability**: Clear trail of why access was granted/denied
3. **Human-in-the-loop**: Approval workflow for sensitive operations
4. **Layered security**: Combine with token scopes for defense in depth
5. **Dynamic**: Rules can be added/modified without code changes
6. **Glob patterns**: Intuitive wildcard matching (dangerous-*, *.delete)

### Negative

1. **Complexity**: More moving parts than simple allow/deny lists
2. **Performance**: Policy evaluation on every request
3. **Configuration burden**: Admins must understand policy system
4. **Priority ordering**: Can be confusing which rule applies

### Policy Rule Structure

```typescript
interface PolicyRule {
  id: string;
  name: string;
  scope: 'global' | 'client' | 'server';
  scopeId?: string;            // Client or server ID for scoped rules
  resourceType: 'tool' | 'server' | 'resource' | 'prompt';
  pattern: string;             // Glob pattern
  action: 'allow' | 'deny' | 'require_approval';
  priority: number;            // Higher = evaluated first
  enabled: boolean;
  conditions?: PolicyCondition[];
  createdAt: number;
  updatedAt: number;
}
```

### Evaluation Algorithm

```
1. Filter rules by:
   - Enabled = true
   - Scope matches (global, or matching client/server)
   - ResourceType matches

2. Sort by priority (descending)

3. For each rule:
   - If pattern matches resource:
     - Return rule's action

4. If no rules match:
   - Return default action (configurable, default: deny)
```

### Example Rules

```typescript
// Allow all tools from trusted server
{
  name: 'Allow trusted server',
  scope: 'server',
  scopeId: 'trusted-server-123',
  resourceType: 'tool',
  pattern: '*',
  action: 'allow',
  priority: 50,
}

// Deny dangerous tools globally
{
  name: 'Block dangerous tools',
  scope: 'global',
  resourceType: 'tool',
  pattern: 'dangerous-*',
  action: 'deny',
  priority: 100,  // Higher priority, evaluated first
}

// Require approval for write operations
{
  name: 'Approve writes',
  scope: 'global',
  resourceType: 'tool',
  pattern: '*.write',
  action: 'require_approval',
  priority: 75,
}
```

### Request Flow

```
Request: Execute tool "file.write" on server "fs-server"
         from client with token "token-123"

1. Get applicable rules (global + server:fs-server + client:token-123)
2. Sort by priority
3. Evaluate:
   - "Block dangerous tools" (100): pattern "dangerous-*" NO MATCH
   - "Approve writes" (75): pattern "*.write" MATCHES
   - Action: require_approval
4. Create approval request, wait for user decision
5. If approved: continue to rate limiting
6. If rejected: return error
```

## Alternatives Considered

### Role-Based Access Control (RBAC)

**Pros**: Well-understood model, simple roles
**Cons**: Less granular, harder to express "require approval" semantics

**Why not chosen**: Need finer-grained control than roles provide.

### Attribute-Based Access Control (ABAC)

**Pros**: Very flexible, can consider any attribute
**Cons**: Complex to implement and understand, harder to audit

**Why not chosen**: Policy-based is sufficient and simpler.

### Simple Allow/Deny Lists

**Pros**: Very simple to understand
**Cons**: Can't express approval workflows, no wildcards, no priorities

**Why not chosen**: Need approval workflow and pattern matching.

### OAuth Scopes Only

**Pros**: Standard approach
**Cons**: Scopes are coarse, no approval workflow

**Why not chosen**: Scopes complement policies but don't replace them.

## Related ADRs

- ADR-002: InversifyJS for PolicyEngineService implementation
- ADR-003: SQLite for policy storage
