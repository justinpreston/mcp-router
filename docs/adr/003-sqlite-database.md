# ADR-003: Use SQLite for Local Storage

## Status

Accepted

## Context

MCP Router needs persistent storage for:
- Server configurations
- API tokens (hashed)
- Policy rules
- Workspaces
- Audit logs
- Memory/context storage

Requirements:
- Must work offline (no network dependency)
- Must be fast for local operations
- Must support structured queries
- Must handle concurrent access from main process
- Should be easy to backup and restore

## Decision

We will use **SQLite** via the `better-sqlite3` library for all persistent storage.

Key implementation details:
- Synchronous API (better-sqlite3) for simplicity and performance
- Single database file in app data directory
- Schema migrations on startup
- Repository pattern for data access

## Consequences

### Positive

1. **Zero configuration**: No database server to install or manage
2. **Single file**: Easy backup, restore, and migration
3. **Fast**: Local file access is very fast for typical workloads
4. **SQL support**: Full SQL query capabilities
5. **Transactions**: ACID compliance for data integrity
6. **Synchronous API**: Simpler code, no callback/promise overhead
7. **Portable**: Database file can be moved between machines

### Negative

1. **Native module**: Requires compilation during installation
2. **No encryption**: Data at rest is not encrypted by default
3. **Single writer**: Only one process can write at a time
4. **Electron rebuild**: May need rebuilding for Electron's Node version

### Database Location

```
macOS:    ~/Library/Application Support/MCP Router/mcp-router.db
Windows:  %APPDATA%\MCP Router\mcp-router.db
Linux:    ~/.config/MCP Router/mcp-router.db
```

### Schema Example

```sql
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  scopes TEXT NOT NULL,
  server_ids TEXT,
  expires_at INTEGER,
  rate_limit TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_tokens_hash ON tokens(hash);
CREATE INDEX idx_tokens_expires ON tokens(expires_at);
```

## Alternatives Considered

### electron-store (JSON files)

**Pros**: No native modules, simple key-value storage
**Cons**: No querying, poor performance with large datasets, no transactions

**Why not chosen**: Insufficient for structured data and relational queries.

### LevelDB / RocksDB

**Pros**: Good performance, embedded
**Cons**: Key-value only, no SQL, complex querying

**Why not chosen**: Need SQL capabilities for complex queries (policies, audit logs).

### IndexedDB (in renderer)

**Pros**: No native modules, browser standard
**Cons**: Async only, browser limitations, data in renderer process

**Why not chosen**: Data should be in main process for security.

### PostgreSQL/MySQL (embedded)

**Pros**: Full SQL, enterprise features
**Cons**: Complex setup, larger footprint, overkill

**Why not chosen**: Too heavy for a desktop application.

### Dexie.js

**Pros**: Nice API over IndexedDB
**Cons**: Same limitations as IndexedDB

**Why not chosen**: Same reasons as IndexedDB.
