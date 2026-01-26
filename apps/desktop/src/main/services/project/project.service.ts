/**
 * Project Service
 *
 * Manages project lifecycle and associations with servers/workspaces.
 * Projects enable multi-tenant routing via x-mcpr-project header.
 */
import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IProjectService,
  IProjectRepository,
  ILogger,
  Project,
  ProjectCreateInput,
  ProjectSettings,
} from '@main/core/interfaces';

/**
 * Generate a URL-safe slug from a name.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

@injectable()
export class ProjectService implements IProjectService {
  constructor(
    @inject(TYPES.ProjectRepository) private projectRepository: IProjectRepository,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async createProject(input: ProjectCreateInput): Promise<Project> {
    const now = Math.floor(Date.now() / 1000);
    const id = nanoid();

    // Generate slug from name if not provided
    let slug = input.slug ?? generateSlug(input.name);

    // Ensure slug uniqueness
    const existingBySlug = await this.projectRepository.findBySlug(slug);
    if (existingBySlug) {
      slug = `${slug}-${nanoid(6)}`;
    }

    const defaultSettings: ProjectSettings = {
      defaultToolPolicy: 'allow',
      requireApproval: false,
      rateLimit: 100,
      env: {},
    };

    const project: Project = {
      id,
      name: input.name,
      description: input.description,
      slug,
      rootPath: input.rootPath,
      serverIds: [],
      workspaceIds: [],
      active: true,
      settings: {
        ...defaultSettings,
        ...input.settings,
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.projectRepository.create(project);

    this.logger.info('Project created', {
      id: project.id,
      name: project.name,
      slug: project.slug,
    });

    return project;
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.projectRepository.findById(projectId);
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    return this.projectRepository.findBySlug(slug);
  }

  async getAllProjects(): Promise<Project[]> {
    return this.projectRepository.findAll();
  }

  async updateProject(
    projectId: string,
    updates: Partial<Project>
  ): Promise<Project> {
    const existing = await this.projectRepository.findById(projectId);
    if (!existing) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = Math.floor(Date.now() / 1000);

    // Don't allow updating id, createdAt, or timestamps directly
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...allowedUpdates
    } = updates;

    // If slug is being updated, ensure uniqueness
    if (allowedUpdates.slug && allowedUpdates.slug !== existing.slug) {
      const existingBySlug = await this.projectRepository.findBySlug(
        allowedUpdates.slug
      );
      if (existingBySlug && existingBySlug.id !== projectId) {
        throw new Error(`Slug already in use: ${allowedUpdates.slug}`);
      }
    }

    const updated: Project = {
      ...existing,
      ...allowedUpdates,
      settings: {
        ...existing.settings,
        ...(allowedUpdates.settings ?? {}),
      },
      updatedAt: now,
    };

    await this.projectRepository.update(updated);

    this.logger.info('Project updated', {
      id: projectId,
      updates: Object.keys(allowedUpdates),
    });

    return updated;
  }

  async deleteProject(projectId: string): Promise<void> {
    const existing = await this.projectRepository.findById(projectId);
    if (!existing) {
      throw new Error(`Project not found: ${projectId}`);
    }

    await this.projectRepository.delete(projectId);

    this.logger.info('Project deleted', { id: projectId });
  }

  async addServerToProject(projectId: string, serverId: string): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (project.serverIds.includes(serverId)) {
      return; // Already added
    }

    const updatedServerIds = [...project.serverIds, serverId];
    await this.updateProject(projectId, { serverIds: updatedServerIds });

    this.logger.debug('Server added to project', { projectId, serverId });
  }

  async removeServerFromProject(
    projectId: string,
    serverId: string
  ): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const updatedServerIds = project.serverIds.filter((id) => id !== serverId);
    await this.updateProject(projectId, { serverIds: updatedServerIds });

    this.logger.debug('Server removed from project', { projectId, serverId });
  }

  async addWorkspaceToProject(
    projectId: string,
    workspaceId: string
  ): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (project.workspaceIds.includes(workspaceId)) {
      return; // Already added
    }

    const updatedWorkspaceIds = [...project.workspaceIds, workspaceId];
    await this.updateProject(projectId, { workspaceIds: updatedWorkspaceIds });

    this.logger.debug('Workspace added to project', { projectId, workspaceId });
  }

  async removeWorkspaceFromProject(
    projectId: string,
    workspaceId: string
  ): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const updatedWorkspaceIds = project.workspaceIds.filter(
      (id) => id !== workspaceId
    );
    await this.updateProject(projectId, { workspaceIds: updatedWorkspaceIds });

    this.logger.debug('Workspace removed from project', {
      projectId,
      workspaceId,
    });
  }
}
