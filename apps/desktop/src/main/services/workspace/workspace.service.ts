import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IWorkspaceService,
  IWorkspaceRepository,
  ILogger,
  Workspace,
} from '@main/core/interfaces';

/**
 * Workspace service for managing project workspaces.
 */
@injectable()
export class WorkspaceService implements IWorkspaceService {
  constructor(
    @inject(TYPES.WorkspaceRepository) private workspaceRepo: IWorkspaceRepository,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async createWorkspace(name: string, path: string): Promise<Workspace> {
    const now = Date.now();
    const workspace: Workspace = {
      id: `workspace-${nanoid(12)}`,
      name,
      path,
      serverIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.workspaceRepo.create(workspace);

    this.logger.info('Workspace created', {
      workspaceId: workspace.id,
      name,
      path,
    });

    return workspace;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.workspaceRepo.findById(workspaceId);
  }

  async getAllWorkspaces(): Promise<Workspace[]> {
    return this.workspaceRepo.findAll();
  }

  async updateWorkspace(
    workspaceId: string,
    updates: Partial<Workspace>
  ): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findById(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Don't allow updating certain fields
    const { id: _id, createdAt: _createdAt, serverIds: _serverIds, ...allowedUpdates } = updates;

    const updatedWorkspace: Workspace = {
      ...workspace,
      ...allowedUpdates,
      updatedAt: Date.now(),
    };

    await this.workspaceRepo.update(updatedWorkspace);

    this.logger.info('Workspace updated', { workspaceId });
    return updatedWorkspace;
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    await this.workspaceRepo.delete(workspaceId);

    this.logger.info('Workspace deleted', { workspaceId });
  }

  async addServerToWorkspace(workspaceId: string, serverId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    if (workspace.serverIds.includes(serverId)) {
      this.logger.warn('Server already in workspace', { workspaceId, serverId });
      return;
    }

    workspace.serverIds.push(serverId);
    workspace.updatedAt = Date.now();

    await this.workspaceRepo.update(workspace);

    this.logger.info('Server added to workspace', { workspaceId, serverId });
  }

  async removeServerFromWorkspace(workspaceId: string, serverId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const index = workspace.serverIds.indexOf(serverId);
    if (index === -1) {
      this.logger.warn('Server not in workspace', { workspaceId, serverId });
      return;
    }

    workspace.serverIds.splice(index, 1);
    workspace.updatedAt = Date.now();

    await this.workspaceRepo.update(workspace);

    this.logger.info('Server removed from workspace', { workspaceId, serverId });
  }
}
