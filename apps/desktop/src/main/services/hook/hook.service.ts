import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IHookService,
  IHookRepository,
  IHookSandbox,
  ILogger,
  Hook,
  HookEvent,
  HookCreateInput,
  HookContext,
  HookResult,
} from '@main/core/interfaces';

const DEFAULT_TIMEOUT = 5000; // 5 seconds
const DEFAULT_PRIORITY = 100;

/**
 * Service for managing and executing custom hooks.
 * Hooks allow users to run custom JavaScript code in response to events.
 */
@injectable()
export class HookService implements IHookService {
  constructor(
    @inject(TYPES.HookRepository) private hookRepository: IHookRepository,
    @inject(TYPES.HookSandbox) private sandbox: IHookSandbox,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async createHook(input: HookCreateInput): Promise<Hook> {
    // Validate code
    const validation = this.sandbox.validate(input.code);
    if (!validation.valid) {
      throw new Error(`Invalid hook code: ${validation.error}`);
    }

    const now = Date.now();
    const hook: Hook = {
      id: nanoid(),
      name: input.name,
      description: input.description,
      event: input.event,
      projectId: input.projectId,
      serverId: input.serverId,
      code: input.code,
      priority: input.priority ?? DEFAULT_PRIORITY,
      enabled: true,
      timeout: input.timeout ?? DEFAULT_TIMEOUT,
      canModify: input.canModify ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await this.hookRepository.create(hook);
    this.logger.info('Hook created', {
      hookId: hook.id,
      name: hook.name,
      event: hook.event,
    });

    return hook;
  }

  async getHook(hookId: string): Promise<Hook | null> {
    return this.hookRepository.findById(hookId);
  }

  async getAllHooks(): Promise<Hook[]> {
    return this.hookRepository.findAll();
  }

  async getHooksForEvent(
    event: HookEvent,
    projectId?: string,
    serverId?: string
  ): Promise<Hook[]> {
    return this.hookRepository.findByEvent(event, projectId, serverId);
  }

  async updateHook(hookId: string, updates: Partial<Hook>): Promise<Hook> {
    const hook = await this.hookRepository.findById(hookId);
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    // Validate code if it's being updated
    if (updates.code !== undefined) {
      const validation = this.sandbox.validate(updates.code);
      if (!validation.valid) {
        throw new Error(`Invalid hook code: ${validation.error}`);
      }
    }

    const updatedHook: Hook = {
      ...hook,
      ...updates,
      id: hook.id, // Preserve ID
      updatedAt: Date.now(),
    };

    await this.hookRepository.update(updatedHook);
    this.logger.info('Hook updated', { hookId });

    return updatedHook;
  }

  async deleteHook(hookId: string): Promise<void> {
    const hook = await this.hookRepository.findById(hookId);
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    await this.hookRepository.delete(hookId);
    this.logger.info('Hook deleted', { hookId, name: hook.name });
  }

  async enableHook(hookId: string): Promise<void> {
    const hook = await this.hookRepository.findById(hookId);
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    hook.enabled = true;
    hook.updatedAt = Date.now();
    await this.hookRepository.update(hook);
    this.logger.info('Hook enabled', { hookId, name: hook.name });
  }

  async disableHook(hookId: string): Promise<void> {
    const hook = await this.hookRepository.findById(hookId);
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    hook.enabled = false;
    hook.updatedAt = Date.now();
    await this.hookRepository.update(hook);
    this.logger.info('Hook disabled', { hookId, name: hook.name });
  }

  async executeHooks(
    event: HookEvent,
    payload: Record<string, unknown>,
    options?: { projectId?: string; serverId?: string }
  ): Promise<HookResult[]> {
    const hooks = await this.hookRepository.findEnabled(
      event,
      options?.projectId,
      options?.serverId
    );

    if (hooks.length === 0) {
      return [];
    }

    this.logger.debug('Executing hooks for event', {
      event,
      hookCount: hooks.length,
      projectId: options?.projectId,
      serverId: options?.serverId,
    });

    const results: HookResult[] = [];
    let currentPayload = payload;

    // Execute hooks in priority order
    for (const hook of hooks) {
      const context: HookContext = {
        event,
        payload: currentPayload,
        meta: {
          hookId: hook.id,
          hookName: hook.name,
          timestamp: Date.now(),
          projectId: hook.projectId,
          serverId: hook.serverId,
        },
      };

      const result = await this.sandbox.execute(hook.code, context, {
        timeout: hook.timeout,
        canModify: hook.canModify,
      });

      results.push(result);

      // If hook can modify and returned modified payload, use it for next hook
      if (hook.canModify && result.success && result.modifiedPayload) {
        currentPayload = result.modifiedPayload;
      }

      // Log execution result
      if (result.success) {
        this.logger.debug('Hook executed successfully', {
          hookId: hook.id,
          hookName: hook.name,
          duration: result.duration,
        });
      } else {
        this.logger.warn('Hook execution failed', {
          hookId: hook.id,
          hookName: hook.name,
          error: result.error,
          duration: result.duration,
        });
      }
    }

    return results;
  }

  async testHook(
    hookId: string,
    payload: Record<string, unknown>
  ): Promise<HookResult> {
    const hook = await this.hookRepository.findById(hookId);
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    const context: HookContext = {
      event: hook.event,
      payload,
      meta: {
        hookId: hook.id,
        hookName: hook.name,
        timestamp: Date.now(),
        projectId: hook.projectId,
        serverId: hook.serverId,
      },
    };

    return this.sandbox.execute(hook.code, context, {
      timeout: hook.timeout,
      canModify: hook.canModify,
    });
  }

  validateCode(code: string): { valid: boolean; error?: string } {
    return this.sandbox.validate(code);
  }
}
