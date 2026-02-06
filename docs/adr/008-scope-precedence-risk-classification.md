# ADR-008: Scope-Based Policy Precedence and Risk Classification

## Status

Accepted

## Context

MCP Router's PolicyEngine previously evaluated rules strictly by `priority` number (highest wins). As the system grew to support client-specific, server-scoped, and global policies, a flat priority model became insufficient — a global "deny all exec tools" rule with priority 100 would override a client-specific "allow exec for admin token" rule with priority 50, which is counterintuitive.

Additionally, all tool calls were rate-limited equally regardless of whether the tool reads data or executes shell commands. AI Hub's production deployment showed that differentiated rate limits based on tool risk level are essential for security.

## Decision

### Scope-Based Policy Precedence

We adopt a two-tier evaluation model:

1. **Primary sort: Scope specificity** — more specific scopes always win over broader scopes
2. **Secondary sort: Priority** — within the same scope, higher priority wins
3. **Tertiary sort: Creation date** — newest rule wins as a tiebreaker

| Scope | Specificity |
|-------|-------------|
| `client` | 3 (highest) |
| `server` / `workspace` | 2 |
| `global` | 1 (lowest) |

This means a client-scoped rule with priority 1 will always override a global rule with priority 1000. The `SCOPE_SPECIFICITY` map is defined in `interfaces.ts`.

### Risk Classification

Tools are classified into three risk levels using regex pattern matching on tool names:

| Level | Patterns | Default Rate Limit |
|-------|----------|-------------------|
| `exec` | exec, run, shell, command, terminal, bash, spawn, evaluate | 10/min |
| `write` | create, update, delete, write, send, post, put, modify, set | 30/min |
| `read` | Everything else | 100/min |

The `classifyToolRisk()` function in `risk-classifier.ts` applies these patterns. Risk-based defaults feed into `RateLimiterService.consumeForTool()`, which auto-configures rate buckets per tool.

### Redaction Action

A new `'redact'` policy action allows tool calls to proceed but masks specified fields in the result:

- `redactFields` stores an array of dot-notation paths (e.g., `['auth.password', 'api_key']`)
- `applyRedactions()` traverses nested objects and replaces matched field values with `'[REDACTED]'`
- Stored as JSON in the `redact_fields` column of the policies table

## Consequences

### Benefits

- **Intuitive precedence**: Client-specific overrides always take effect, matching user expectations
- **Defense in depth**: Exec tools are rate-limited 10x more aggressively than read tools by default
- **Data protection**: Sensitive fields can be masked from tool results without blocking the call entirely
- **Backward compatible**: Existing rules continue to work — scope specificity merely refines ordering

### Trade-offs

- Regex-based classification may misclassify tools with unconventional names (e.g., a read tool named `execute_query`); per-tool overrides can address these cases
- Scope precedence makes priority values less powerful — a high-priority global rule cannot override a low-priority client rule by design

## Alternatives Considered

### 1. Flat priority with no scope hierarchy
Rejected — leads to confusing behavior where global rules block client-specific exceptions.

### 2. LLM-based tool risk classification
Rejected — adds latency and an external dependency for a hot path. Regex is deterministic and zero-cost.

### 3. Per-tool risk annotations (manual)
Rejected — doesn't scale. Server operators would need to annotate every tool. Regex-based classification provides sensible defaults with manual overrides available.
