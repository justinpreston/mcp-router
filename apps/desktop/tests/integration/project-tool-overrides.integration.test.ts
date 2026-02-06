/**
 * Integration tests for Project Tool Override feature
 * Tests repository CRUD and service upsert logic with real in-memory database
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container } from 'inversify';
import { nanoid } from 'nanoid';
import 'reflect-metadata';

import { TYPES } from '@main/core/types';
import type {
  IProjectService,
  IProjectRepository,
  IProjectToolOverrideRepository,
  ILogger,
  IDatabase,
  IConfig,
  Project,
} from '@main/core/interfaces';
import { ProjectService } from '@main/services/project/project.service';
import { ProjectRepository } from '@main/repositories/project.repository';
import { ProjectToolOverrideRepository } from '@main/repositories/project-tool-override.repository';
import { SqliteDatabase } from '@main/services/core/database.service';
import { createMockLogger, createMockConfig } from '../utils';

function buildOverride(projectId: string, toolName: string, overrides?: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: nanoid(),
    projectId,
    toolName,
    visible: true,
    priority: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildProject(overrides?: Partial<Project>): Project {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: nanoid(),
    name: 'Test Project',
    slug: `test-project-${nanoid(6)}`,
    serverIds: [],
    workspaceIds: [],
    active: true,
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Project Tool Overrides Integration', () => {
  let container: Container;
  let projectService: IProjectService;
  let overrideRepo: IProjectToolOverrideRepository;
  let projectRepo: IProjectRepository;
  let database: IDatabase;
  let testProject: Project;

  beforeEach(async () => {
    container = new Container();

    const mockLogger = createMockLogger();
    const mockConfig = createMockConfig();
    container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);
    container.bind<IConfig>(TYPES.Config).toConstantValue(mockConfig);

    // Create real database service with in-memory SQLite
    const dbService = new SqliteDatabase(mockConfig as any, mockLogger as any);
    (dbService as any).dbPath = ':memory:';
    dbService.initialize();
    database = dbService;
    container.bind<IDatabase>(TYPES.Database).toConstantValue(database);

    // Real repositories
    projectRepo = new ProjectRepository(database);
    overrideRepo = new ProjectToolOverrideRepository(database);
    container.bind<IProjectRepository>(TYPES.ProjectRepository).toConstantValue(projectRepo);
    container
      .bind<IProjectToolOverrideRepository>(TYPES.ProjectToolOverrideRepository)
      .toConstantValue(overrideRepo);

    // Real project service
    container.bind<IProjectService>(TYPES.ProjectService).to(ProjectService);
    projectService = container.get<IProjectService>(TYPES.ProjectService);

    // Seed a test project
    testProject = await projectRepo.create(buildProject());
  });

  afterEach(() => {
    if (database) {
      database.close();
    }
  });

  describe('ProjectToolOverrideRepository', () => {
    it('should create an override', async () => {
      const input = buildOverride(testProject.id, 'server1__read_file', { priority: 10 });
      const override = await overrideRepo.create(input);

      expect(override).toBeDefined();
      expect(override.id).toBe(input.id);
      expect(override.projectId).toBe(testProject.id);
      expect(override.toolName).toBe('server1__read_file');
      expect(override.visible).toBe(true);
      expect(override.priority).toBe(10);
    });

    it('should find override by id', async () => {
      const created = await overrideRepo.create(
        buildOverride(testProject.id, 'server1__write_file', { visible: false, priority: 5 })
      );

      const found = await overrideRepo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.visible).toBe(false);
    });

    it('should return null for non-existent id', async () => {
      const found = await overrideRepo.findById('nonexistent');
      expect(found).toBeNull();
    });

    it('should find all overrides by project id', async () => {
      await overrideRepo.create(buildOverride(testProject.id, 'tool_a', { priority: 1 }));
      await overrideRepo.create(buildOverride(testProject.id, 'tool_b', { priority: 10 }));

      const overrides = await overrideRepo.findByProjectId(testProject.id);
      expect(overrides).toHaveLength(2);
      // Should be ordered by priority DESC
      expect(overrides[0]!.toolName).toBe('tool_b');
      expect(overrides[1]!.toolName).toBe('tool_a');
    });

    it('should find override by project and tool name', async () => {
      await overrideRepo.create(buildOverride(testProject.id, 'server1__search'));

      const found = await overrideRepo.findByProjectAndTool(testProject.id, 'server1__search');
      expect(found).toBeDefined();
      expect(found!.toolName).toBe('server1__search');
    });

    it('should return null for non-existent project+tool combo', async () => {
      const found = await overrideRepo.findByProjectAndTool(testProject.id, 'nonexistent_tool');
      expect(found).toBeNull();
    });

    it('should update an override', async () => {
      const created = await overrideRepo.create(buildOverride(testProject.id, 'tool_x'));

      const updated = await overrideRepo.update({
        ...created,
        visible: false,
        displayName: 'Renamed Tool',
        priority: 50,
        updatedAt: Math.floor(Date.now() / 1000),
      });

      expect(updated.visible).toBe(false);
      expect(updated.displayName).toBe('Renamed Tool');
      expect(updated.priority).toBe(50);
    });

    it('should delete an override by id', async () => {
      const created = await overrideRepo.create(buildOverride(testProject.id, 'tool_delete'));

      await overrideRepo.delete(created.id);
      const found = await overrideRepo.findById(created.id);
      expect(found).toBeNull();
    });

    it('should delete all overrides for a project', async () => {
      await overrideRepo.create(buildOverride(testProject.id, 'tool_1'));
      await overrideRepo.create(buildOverride(testProject.id, 'tool_2'));

      await overrideRepo.deleteByProjectId(testProject.id);
      const overrides = await overrideRepo.findByProjectId(testProject.id);
      expect(overrides).toHaveLength(0);
    });

    it('should delete by project and tool name', async () => {
      await overrideRepo.create(buildOverride(testProject.id, 'tool_keep'));
      await overrideRepo.create(buildOverride(testProject.id, 'tool_remove'));

      await overrideRepo.deleteByProjectAndTool(testProject.id, 'tool_remove');
      const overrides = await overrideRepo.findByProjectId(testProject.id);
      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.toolName).toBe('tool_keep');
    });

    it('should enforce unique project_id + tool_name constraint', async () => {
      await overrideRepo.create(buildOverride(testProject.id, 'unique_tool'));

      await expect(
        overrideRepo.create(buildOverride(testProject.id, 'unique_tool'))
      ).rejects.toThrow();
    });

    it('should handle defaultArgs as JSON', async () => {
      const defaultArgs = { path: '/tmp', recursive: true };
      const created = await overrideRepo.create(
        buildOverride(testProject.id, 'tool_with_args', { defaultArgs })
      );

      const found = await overrideRepo.findById(created.id);
      expect(found!.defaultArgs).toEqual(defaultArgs);
    });
  });

  describe('ProjectService Tool Override Methods', () => {
    it('should set a new tool override via service', async () => {
      const override = await projectService.setToolOverride(testProject.id, {
        toolName: 'server1__read_file',
        visible: false,
        priority: 10,
      });

      expect(override).toBeDefined();
      expect(override.toolName).toBe('server1__read_file');
      expect(override.visible).toBe(false);
      expect(override.priority).toBe(10);
    });

    it('should upsert (update) existing tool override', async () => {
      // Create initial
      await projectService.setToolOverride(testProject.id, {
        toolName: 'server1__write_file',
        visible: true,
        priority: 5,
      });

      // Upsert with new values
      const updated = await projectService.setToolOverride(testProject.id, {
        toolName: 'server1__write_file',
        visible: false,
        displayName: 'Write File (Custom)',
        priority: 20,
      });

      expect(updated.visible).toBe(false);
      expect(updated.displayName).toBe('Write File (Custom)');
      expect(updated.priority).toBe(20);

      // Should only have one override, not two
      const overrides = await projectService.getToolOverrides(testProject.id);
      expect(overrides).toHaveLength(1);
    });

    it('should list all tool overrides for a project', async () => {
      await projectService.setToolOverride(testProject.id, {
        toolName: 'tool_a',
        visible: true,
      });
      await projectService.setToolOverride(testProject.id, {
        toolName: 'tool_b',
        visible: false,
      });

      const overrides = await projectService.getToolOverrides(testProject.id);
      expect(overrides).toHaveLength(2);
    });

    it('should get a specific tool override', async () => {
      await projectService.setToolOverride(testProject.id, {
        toolName: 'server1__search',
        visible: true,
        displayName: 'Search',
      });

      const override = await projectService.getToolOverride(testProject.id, 'server1__search');
      expect(override).toBeDefined();
      expect(override!.displayName).toBe('Search');
    });

    it('should return null for non-existent tool override', async () => {
      const override = await projectService.getToolOverride(testProject.id, 'nonexistent');
      expect(override).toBeNull();
    });

    it('should remove a tool override', async () => {
      await projectService.setToolOverride(testProject.id, {
        toolName: 'tool_to_remove',
        visible: false,
      });

      await projectService.removeToolOverride(testProject.id, 'tool_to_remove');
      const override = await projectService.getToolOverride(testProject.id, 'tool_to_remove');
      expect(override).toBeNull();
    });

    it('should remove all tool overrides for a project', async () => {
      await projectService.setToolOverride(testProject.id, {
        toolName: 'tool_1',
        visible: true,
      });
      await projectService.setToolOverride(testProject.id, {
        toolName: 'tool_2',
        visible: false,
      });

      await projectService.removeAllToolOverrides(testProject.id);
      const overrides = await projectService.getToolOverrides(testProject.id);
      expect(overrides).toHaveLength(0);
    });

    it('should throw when setting override for non-existent project', async () => {
      await expect(
        projectService.setToolOverride('nonexistent-project', {
          toolName: 'tool_x',
          visible: false,
        })
      ).rejects.toThrow();
    });
  });
});
