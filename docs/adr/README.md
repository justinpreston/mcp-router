# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) documenting significant architectural decisions made in the MCP Router project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision along with its context and consequences. ADRs help teams understand:

- Why a decision was made
- What alternatives were considered
- What trade-offs were accepted

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./001-electron-framework.md) | Use Electron for Desktop Application | Accepted | 2024-01 |
| [ADR-002](./002-inversifyjs-dependency-injection.md) | Use InversifyJS for Dependency Injection | Accepted | 2024-01 |
| [ADR-003](./003-sqlite-database.md) | Use SQLite for Local Storage | Accepted | 2024-01 |
| [ADR-004](./004-zustand-state-management.md) | Use Zustand for UI State Management | Accepted | 2024-01 |
| [ADR-005](./005-shadcn-ui-components.md) | Use shadcn/ui Component Patterns | Accepted | 2024-01 |
| [ADR-006](./006-policy-based-access-control.md) | Implement Policy-Based Access Control | Accepted | 2024-01 |

## ADR Template

When creating a new ADR, use the following template:

```markdown
# ADR-XXX: Title

## Status

[Proposed | Accepted | Deprecated | Superseded]

## Context

What is the issue that we're seeing that motivates this decision?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?

## Alternatives Considered

What other options were evaluated?
```
