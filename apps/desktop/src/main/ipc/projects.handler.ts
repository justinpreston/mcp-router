/**
 * IPC handlers for project management.
 */
import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { IProjectService, ILogger, Project } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import { z } from 'zod';
import { validateInput, NonEmptyString, ServerId, WorkspaceId } from './validation-schemas';

// ============================================================================
// Validation Schemas
// ============================================================================

const ProjectId = z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid project ID');

const SlugSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens');

const ProjectSettingsSchema = z.object({
  defaultToolPolicy: z.enum(['allow', 'deny', 'require_approval']).optional(),
  requireApproval: z.boolean().optional(),
  rateLimit: z.number().int().min(1).max(10000).optional(),
  env: z.record(z.string().max(100), z.string().max(10000)).optional(),
});

const ProjectCreateSchema = z.object({
  name: NonEmptyString.max(100),
  description: z.string().max(1000).optional(),
  slug: SlugSchema.optional(),
  rootPath: z.string().max(4096).optional(),
  settings: ProjectSettingsSchema.optional(),
});

const ProjectUpdateSchema = z.object({
  name: NonEmptyString.max(100).optional(),
  description: z.string().max(1000).optional(),
  slug: SlugSchema.optional(),
  rootPath: z.string().max(4096).optional(),
  active: z.boolean().optional(),
  settings: ProjectSettingsSchema.optional(),
});

// ============================================================================
// API Types
// ============================================================================

export interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  slug: string;
  rootPath?: string;
  serverIds: string[];
  workspaceIds: string[];
  active: boolean;
  settings: {
    defaultToolPolicy?: string;
    requireApproval?: boolean;
    rateLimit?: number;
    env?: Record<string, string>;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * Transform internal Project to API-safe ProjectInfo.
 */
function toProjectInfo(project: Project): ProjectInfo {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    slug: project.slug,
    rootPath: project.rootPath,
    serverIds: project.serverIds,
    workspaceIds: project.workspaceIds,
    active: project.active,
    settings: project.settings,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Register IPC handlers for project management.
 */
export function registerProjectHandlers(container: Container): void {
  const projectService = container.get<IProjectService>(TYPES.ProjectService);
  const logger = container.get<ILogger>(TYPES.Logger);

  // List all projects
  ipcMain.handle('projects:list', async () => {
    logger.debug('IPC: projects:list');

    const projects = await projectService.getAllProjects();
    return projects.map(toProjectInfo);
  });

  // Get single project by ID
  ipcMain.handle('projects:get', async (_event, id: unknown) => {
    const validId = validateInput(ProjectId, id);
    logger.debug('IPC: projects:get', { id: validId });

    const project = await projectService.getProject(validId);
    return project ? toProjectInfo(project) : null;
  });

  // Get project by slug
  ipcMain.handle('projects:getBySlug', async (_event, slug: unknown) => {
    const validSlug = validateInput(SlugSchema, slug);
    logger.debug('IPC: projects:getBySlug', { slug: validSlug });

    const project = await projectService.getProjectBySlug(validSlug);
    return project ? toProjectInfo(project) : null;
  });

  // Create project
  ipcMain.handle('projects:create', async (_event, input: unknown) => {
    const validInput = validateInput(ProjectCreateSchema, input);
    logger.debug('IPC: projects:create', { name: validInput.name });

    const project = await projectService.createProject(validInput);
    return toProjectInfo(project);
  });

  // Update project
  ipcMain.handle(
    'projects:update',
    async (_event, id: unknown, updates: unknown) => {
      const validId = validateInput(ProjectId, id);
      const validUpdates = validateInput(ProjectUpdateSchema, updates);
      logger.debug('IPC: projects:update', { id: validId });

      const project = await projectService.updateProject(validId, validUpdates);
      return toProjectInfo(project);
    }
  );

  // Delete project
  ipcMain.handle('projects:delete', async (_event, id: unknown) => {
    const validId = validateInput(ProjectId, id);
    logger.debug('IPC: projects:delete', { id: validId });

    await projectService.deleteProject(validId);
  });

  // Add server to project
  ipcMain.handle(
    'projects:addServer',
    async (_event, projectId: unknown, serverId: unknown) => {
      const validProjectId = validateInput(ProjectId, projectId);
      const validServerId = validateInput(ServerId, serverId);
      logger.debug('IPC: projects:addServer', {
        projectId: validProjectId,
        serverId: validServerId,
      });

      await projectService.addServerToProject(validProjectId, validServerId);
    }
  );

  // Remove server from project
  ipcMain.handle(
    'projects:removeServer',
    async (_event, projectId: unknown, serverId: unknown) => {
      const validProjectId = validateInput(ProjectId, projectId);
      const validServerId = validateInput(ServerId, serverId);
      logger.debug('IPC: projects:removeServer', {
        projectId: validProjectId,
        serverId: validServerId,
      });

      await projectService.removeServerFromProject(
        validProjectId,
        validServerId
      );
    }
  );

  // Add workspace to project
  ipcMain.handle(
    'projects:addWorkspace',
    async (_event, projectId: unknown, workspaceId: unknown) => {
      const validProjectId = validateInput(ProjectId, projectId);
      const validWorkspaceId = validateInput(WorkspaceId, workspaceId);
      logger.debug('IPC: projects:addWorkspace', {
        projectId: validProjectId,
        workspaceId: validWorkspaceId,
      });

      await projectService.addWorkspaceToProject(
        validProjectId,
        validWorkspaceId
      );
    }
  );

  // Remove workspace from project
  ipcMain.handle(
    'projects:removeWorkspace',
    async (_event, projectId: unknown, workspaceId: unknown) => {
      const validProjectId = validateInput(ProjectId, projectId);
      const validWorkspaceId = validateInput(WorkspaceId, workspaceId);
      logger.debug('IPC: projects:removeWorkspace', {
        projectId: validProjectId,
        workspaceId: validWorkspaceId,
      });

      await projectService.removeWorkspaceFromProject(
        validProjectId,
        validWorkspaceId
      );
    }
  );
}
