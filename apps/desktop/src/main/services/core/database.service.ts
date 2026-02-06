import { injectable, inject } from 'inversify';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { TYPES } from '@main/core/types';
import type { IDatabase, IConfig, ILogger } from '@main/core/interfaces';

/**
 * SQLite database service using better-sqlite3.
 * Provides synchronous database operations with proper error handling.
 */
@injectable()
export class SqliteDatabase implements IDatabase {
  private _db: Database.Database | null = null;

  constructor(
    @inject(TYPES.Config) private config: IConfig,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  get db(): Database.Database {
    if (!this._db) {
      this.initialize();
    }
    return this._db!;
  }

  /**
   * Initialize the database connection.
   */
  initialize(): void {
    if (this._db) {
      return;
    }

    const dbPath = this.getDatabasePath();
    this.ensureDirectory(path.dirname(dbPath));

    this.logger.info('Initializing database', { path: dbPath });

    try {
      this._db = new Database(dbPath, {
        // Enable WAL mode for better concurrent access
        // verbose: this.config.isDevelopment ? console.log : undefined,
      });

      // Configure database for optimal performance and safety
      this._db.pragma('journal_mode = WAL');
      this._db.pragma('synchronous = NORMAL');
      this._db.pragma('foreign_keys = ON');
      this._db.pragma('temp_store = MEMORY');
      this._db.pragma('mmap_size = 268435456'); // 256MB

      // Run migrations
      this.runMigrations();

      this.logger.info('Database initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this._db) {
      this._db.close();
      this._db = null;
      this.logger.info('Database connection closed');
    }
  }

  /**
   * Execute operations within a transaction.
   */
  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  /**
   * Get the full database file path.
   */
  private getDatabasePath(): string {
    const dbFile = this.config.get<string>('database.path', 'mcp-router.db');

    // If absolute path, use as-is
    if (path.isAbsolute(dbFile)) {
      return dbFile;
    }

    // Otherwise, put in data directory
    return path.join(this.config.dataPath, dbFile);
  }

  /**
   * Ensure directory exists with secure permissions.
   */
  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Run database migrations.
   */
  private runMigrations(): void {
    // Create migrations table if not exists
    this._db!.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Get applied migrations
    const applied = new Set(
      (this._db!
        .prepare('SELECT name FROM migrations')
        .all() as Array<{ name: string }>)
        .map((row) => row.name)
    );

    // Define migrations
    const migrations: Array<{ name: string; up: string }> = [
      {
        name: '001_initial_schema',
        up: `
          -- Servers table
          CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            args TEXT NOT NULL DEFAULT '[]',
            env TEXT,
            transport TEXT NOT NULL DEFAULT 'stdio',
            status TEXT NOT NULL DEFAULT 'stopped',
            project_id TEXT,
            tool_permissions TEXT NOT NULL DEFAULT '{}',
            last_error TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
          );

          -- Workspaces table
          CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            server_ids TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
          );

          -- Policies table
          CREATE TABLE IF NOT EXISTS policies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            scope TEXT NOT NULL,
            scope_id TEXT,
            resource_type TEXT NOT NULL,
            pattern TEXT NOT NULL,
            action TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            conditions TEXT,
            redact_fields TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
          );

          CREATE INDEX IF NOT EXISTS idx_policies_scope ON policies(scope, scope_id);
          CREATE INDEX IF NOT EXISTS idx_policies_enabled ON policies(enabled);

          -- Memories table
          CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL UNIQUE,
            tags TEXT NOT NULL DEFAULT '[]',
            embedding BLOB,
            source TEXT,
            metadata TEXT,
            access_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            last_accessed_at INTEGER DEFAULT (strftime('%s', 'now'))
          );

          CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);
          CREATE INDEX IF NOT EXISTS idx_memories_access ON memories(last_accessed_at);

          -- Audit events table
          CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            client_id TEXT,
            server_id TEXT,
            tool_name TEXT,
            success INTEGER NOT NULL,
            duration INTEGER,
            metadata TEXT,
            timestamp INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(type);
          CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_events(client_id);
          CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
        `,
      },
      {
        name: '002_projects_table',
        up: `
          -- Projects table for multi-tenant organization
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            slug TEXT NOT NULL UNIQUE,
            root_path TEXT,
            server_ids TEXT NOT NULL DEFAULT '[]',
            workspace_ids TEXT NOT NULL DEFAULT '[]',
            active INTEGER NOT NULL DEFAULT 1,
            settings TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
          );

          CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
          CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(active);
        `,
      },
      {
        name: '003_workflows_table',
        up: `
          -- Workflows table for workflow definitions
          CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            project_id TEXT,
            steps TEXT NOT NULL DEFAULT '[]',
            trigger TEXT,
            input_schema TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            version INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            last_run_at INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id);
          CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);

          -- Workflow executions table for tracking runs
          CREATE TABLE IF NOT EXISTS workflow_executions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_name TEXT NOT NULL,
            workflow_version INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            input TEXT,
            output TEXT,
            error TEXT,
            steps TEXT NOT NULL DEFAULT '[]',
            current_step_id TEXT,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            triggered_by TEXT,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_executions_workflow ON workflow_executions(workflow_id);
          CREATE INDEX IF NOT EXISTS idx_executions_status ON workflow_executions(status);
          CREATE INDEX IF NOT EXISTS idx_executions_started ON workflow_executions(started_at);
        `,
      },
      {
        name: '004_hooks_table',
        up: `
          -- Hooks table for custom JavaScript hooks
          CREATE TABLE IF NOT EXISTS hooks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            event TEXT NOT NULL,
            project_id TEXT,
            server_id TEXT,
            code TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 100,
            enabled INTEGER NOT NULL DEFAULT 1,
            timeout INTEGER NOT NULL DEFAULT 5000,
            can_modify INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_hooks_event ON hooks(event);
          CREATE INDEX IF NOT EXISTS idx_hooks_project ON hooks(project_id);
          CREATE INDEX IF NOT EXISTS idx_hooks_server ON hooks(server_id);
          CREATE INDEX IF NOT EXISTS idx_hooks_enabled ON hooks(enabled);
        `,
      },
      {
        name: '005_skills_table',
        up: `
          -- Skills table for MCP server skill discovery
          CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            path TEXT UNIQUE,
            url TEXT,
            source TEXT NOT NULL CHECK(source IN ('local', 'symlink', 'remote', 'builtin')),
            status TEXT NOT NULL DEFAULT 'loading' CHECK(status IN ('available', 'unavailable', 'error', 'loading')),
            server_config TEXT,
            manifest TEXT,
            project_id TEXT,
            tags TEXT NOT NULL DEFAULT '[]',
            enabled INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            last_checked_at INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
          CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
          CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
          CREATE INDEX IF NOT EXISTS idx_skills_project ON skills(project_id);
          CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
        `,
      },
      {
        name: '002_memory_type_importance',
        up: `
          -- Add type and importance columns to memories table
          ALTER TABLE memories ADD COLUMN type TEXT NOT NULL DEFAULT 'note';
          ALTER TABLE memories ADD COLUMN importance REAL NOT NULL DEFAULT 0.5;
          
          -- Create index for type-based queries
          CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
        `,
      },
      {
        name: '006_advanced_memory_system',
        up: `
          -- ============================================================
          -- Advanced Memory System Migration
          -- Implements: MemGPT, Generative Agents, RAPTOR, GraphRAG patterns
          -- ============================================================

          -- Episodes table (Episodic Memory - Generative Agents pattern)
          CREATE TABLE IF NOT EXISTS episodes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT,
            session_id TEXT,
            memory_ids TEXT NOT NULL DEFAULT '[]',
            entities TEXT NOT NULL DEFAULT '[]',
            topics TEXT NOT NULL DEFAULT '[]',
            sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            is_active INTEGER NOT NULL DEFAULT 1,
            parent_episode_id TEXT,
            importance REAL NOT NULL DEFAULT 0.5,
            embedding BLOB,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            FOREIGN KEY (parent_episode_id) REFERENCES episodes(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
          CREATE INDEX IF NOT EXISTS idx_episodes_active ON episodes(is_active);
          CREATE INDEX IF NOT EXISTS idx_episodes_started ON episodes(started_at);

          -- Entities table (GraphRAG pattern)
          CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('person', 'organization', 'location', 'concept', 'tool', 'project', 'file', 'technology', 'event', 'custom')),
            description TEXT,
            aliases TEXT NOT NULL DEFAULT '[]',
            mentioned_in_memory_ids TEXT NOT NULL DEFAULT '[]',
            mention_count INTEGER NOT NULL DEFAULT 0,
            first_seen_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL,
            importance REAL NOT NULL DEFAULT 0.5,
            embedding BLOB,
            attributes TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
          );

          CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
          CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
          CREATE INDEX IF NOT EXISTS idx_entities_importance ON entities(importance);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_name_type ON entities(name, type);

          -- Entity relations table (GraphRAG pattern)
          CREATE TABLE IF NOT EXISTS entity_relations (
            id TEXT PRIMARY KEY,
            source_entity_id TEXT NOT NULL,
            target_entity_id TEXT NOT NULL,
            relation_type TEXT NOT NULL CHECK(relation_type IN ('works_at', 'works_on', 'created_by', 'uses', 'depends_on', 'related_to', 'part_of', 'located_in', 'happened_at', 'prefers', 'dislikes', 'custom')),
            description TEXT,
            strength REAL NOT NULL DEFAULT 0.5,
            source_memory_ids TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            last_reinforced_at INTEGER NOT NULL,
            FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_relations_source ON entity_relations(source_entity_id);
          CREATE INDEX IF NOT EXISTS idx_relations_target ON entity_relations(target_entity_id);
          CREATE INDEX IF NOT EXISTS idx_relations_type ON entity_relations(relation_type);

          -- Memory clusters table (RAPTOR pattern)
          CREATE TABLE IF NOT EXISTS memory_clusters (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            summary TEXT NOT NULL,
            memory_ids TEXT NOT NULL DEFAULT '[]',
            parent_cluster_id TEXT,
            child_cluster_ids TEXT NOT NULL DEFAULT '[]',
            level INTEGER NOT NULL DEFAULT 0,
            centroid_embedding BLOB,
            coherence_score REAL NOT NULL DEFAULT 0.0,
            total_memory_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            FOREIGN KEY (parent_cluster_id) REFERENCES memory_clusters(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_clusters_parent ON memory_clusters(parent_cluster_id);
          CREATE INDEX IF NOT EXISTS idx_clusters_level ON memory_clusters(level);

          -- Reflections table (Generative Agents pattern)
          CREATE TABLE IF NOT EXISTS reflections (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('belief', 'pattern', 'preference', 'goal', 'constraint', 'summary', 'insight')),
            source_memory_ids TEXT NOT NULL DEFAULT '[]',
            confidence REAL NOT NULL DEFAULT 0.5,
            evidence_count INTEGER NOT NULL DEFAULT 0,
            open_questions TEXT,
            is_contradicted INTEGER NOT NULL DEFAULT 0,
            contradicted_by_id TEXT,
            embedding BLOB,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            validated_at INTEGER,
            FOREIGN KEY (contradicted_by_id) REFERENCES reflections(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_reflections_type ON reflections(type);
          CREATE INDEX IF NOT EXISTS idx_reflections_contradicted ON reflections(is_contradicted);

          -- Contradictions table (BDI Agent pattern)
          CREATE TABLE IF NOT EXISTS contradictions (
            id TEXT PRIMARY KEY,
            item_a_id TEXT NOT NULL,
            item_a_type TEXT NOT NULL CHECK(item_a_type IN ('memory', 'reflection')),
            item_b_id TEXT NOT NULL,
            item_b_type TEXT NOT NULL CHECK(item_b_type IN ('memory', 'reflection')),
            description TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('factual', 'preference', 'temporal', 'logical')),
            severity REAL NOT NULL DEFAULT 0.5,
            status TEXT NOT NULL DEFAULT 'unresolved' CHECK(status IN ('unresolved', 'resolved_newer', 'resolved_older', 'resolved_merged', 'acknowledged')),
            resolution TEXT,
            resolved_in_favor_of TEXT,
            detected_at INTEGER NOT NULL,
            resolved_at INTEGER
          );

          CREATE INDEX IF NOT EXISTS idx_contradictions_status ON contradictions(status);
          CREATE INDEX IF NOT EXISTS idx_contradictions_type ON contradictions(type);

          -- Memory provenance table (Trust tracking)
          CREATE TABLE IF NOT EXISTS memory_provenance (
            memory_id TEXT PRIMARY KEY,
            source_type TEXT NOT NULL CHECK(source_type IN ('user_stated', 'user_confirmed', 'inferred', 'tool_result', 'document', 'external_api', 'reflection')),
            source_id TEXT,
            source_name TEXT,
            trust_score REAL NOT NULL DEFAULT 0.5,
            verified INTEGER NOT NULL DEFAULT 0,
            verification_method TEXT,
            verified_by TEXT,
            recorded_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_provenance_source ON memory_provenance(source_type);
          CREATE INDEX IF NOT EXISTS idx_provenance_trust ON memory_provenance(trust_score);

          -- Working memory table (MemGPT pattern - persistent for recovery)
          CREATE TABLE IF NOT EXISTS working_memory (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
            tool_call_id TEXT,
            added_at INTEGER NOT NULL,
            token_count INTEGER NOT NULL DEFAULT 0,
            priority INTEGER NOT NULL DEFAULT 0,
            pinned INTEGER NOT NULL DEFAULT 0,
            source_memory_id TEXT,
            session_id TEXT,
            FOREIGN KEY (source_memory_id) REFERENCES memories(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_working_memory_session ON working_memory(session_id);
          CREATE INDEX IF NOT EXISTS idx_working_memory_added ON working_memory(added_at);
          CREATE INDEX IF NOT EXISTS idx_working_memory_pinned ON working_memory(pinned);

          -- Forgetting policies table
          CREATE TABLE IF NOT EXISTS forgetting_policies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            conditions TEXT NOT NULL DEFAULT '[]',
            action TEXT NOT NULL CHECK(action IN ('archive', 'summarize', 'delete', 'demote')),
            applicable_types TEXT,
            exempt_tags TEXT,
            min_importance_exemption REAL,
            last_run_at INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
          );

          CREATE INDEX IF NOT EXISTS idx_forgetting_enabled ON forgetting_policies(enabled);

          -- Extend memories table with temporal fields
          ALTER TABLE memories ADD COLUMN expires_at INTEGER;
          ALTER TABLE memories ADD COLUMN decay_rate REAL DEFAULT 0.99;
          ALTER TABLE memories ADD COLUMN episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL;
          
          CREATE INDEX IF NOT EXISTS idx_memories_episode ON memories(episode_id);
          CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at);
        `,
      },
      {
        name: '007_policy_redact_fields',
        up: `
          -- Add redact_fields column to policies table for field-level redaction support
          ALTER TABLE policies ADD COLUMN redact_fields TEXT;
        `,
      },
    ];

    // Apply pending migrations
    for (const migration of migrations) {
      if (!applied.has(migration.name)) {
        this.logger.info('Applying migration', { name: migration.name });

        this._db!.transaction(() => {
          this._db!.exec(migration.up);
          this._db!
            .prepare('INSERT INTO migrations (name) VALUES (?)')
            .run(migration.name);
        })();

        this.logger.info('Migration applied', { name: migration.name });
      }
    }
  }
}
