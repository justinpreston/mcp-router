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
