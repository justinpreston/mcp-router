import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import { z } from 'zod';
import { TYPES } from '@main/core/types';
import type { IHookService } from '@main/core/interfaces';

// ============================================================================
// Zod Schemas
// ============================================================================

const HookIdSchema = z.string().min(1, 'Hook ID is required');

const HookEventSchema = z.enum([
  'server:before-start',
  'server:after-start',
  'server:before-stop',
  'server:after-stop',
  'tool:before-call',
  'tool:after-call',
  'approval:created',
  'approval:resolved',
  'workflow:before-execute',
  'workflow:after-execute',
  'workflow:step-complete',
]);

const HookCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  event: HookEventSchema,
  projectId: z.string().optional(),
  serverId: z.string().optional(),
  code: z.string().min(1).max(50000), // Max 50KB of code
  priority: z.number().int().min(0).max(1000).optional(),
  timeout: z.number().int().min(100).max(30000).optional(), // 100ms - 30s
  canModify: z.boolean().optional(),
});

const HookUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  event: HookEventSchema.optional(),
  projectId: z.string().optional(),
  serverId: z.string().optional(),
  code: z.string().min(1).max(50000).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  timeout: z.number().int().min(100).max(30000).optional(),
  canModify: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const PayloadSchema = z.record(z.unknown());

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerHookHandlers(container: Container): void {
  const hookService = container.get<IHookService>(TYPES.HookService);

  // List all hooks
  ipcMain.handle('hooks:list', async () => {
    return hookService.getAllHooks();
  });

  // Get hook by ID
  ipcMain.handle('hooks:get', async (_, hookId: unknown) => {
    const id = HookIdSchema.parse(hookId);
    return hookService.getHook(id);
  });

  // Get hooks for event
  ipcMain.handle(
    'hooks:getForEvent',
    async (_, event: unknown, projectId?: unknown, serverId?: unknown) => {
      const validatedEvent = HookEventSchema.parse(event);
      const validatedProjectId = projectId
        ? z.string().parse(projectId)
        : undefined;
      const validatedServerId = serverId
        ? z.string().parse(serverId)
        : undefined;
      return hookService.getHooksForEvent(
        validatedEvent,
        validatedProjectId,
        validatedServerId
      );
    }
  );

  // Create hook
  ipcMain.handle('hooks:create', async (_, input: unknown) => {
    const validated = HookCreateSchema.parse(input);
    return hookService.createHook(validated);
  });

  // Update hook
  ipcMain.handle(
    'hooks:update',
    async (_, hookId: unknown, updates: unknown) => {
      const id = HookIdSchema.parse(hookId);
      const validated = HookUpdateSchema.parse(updates);
      return hookService.updateHook(id, validated);
    }
  );

  // Delete hook
  ipcMain.handle('hooks:delete', async (_, hookId: unknown) => {
    const id = HookIdSchema.parse(hookId);
    await hookService.deleteHook(id);
  });

  // Enable hook
  ipcMain.handle('hooks:enable', async (_, hookId: unknown) => {
    const id = HookIdSchema.parse(hookId);
    await hookService.enableHook(id);
  });

  // Disable hook
  ipcMain.handle('hooks:disable', async (_, hookId: unknown) => {
    const id = HookIdSchema.parse(hookId);
    await hookService.disableHook(id);
  });

  // Test hook
  ipcMain.handle(
    'hooks:test',
    async (_, hookId: unknown, payload: unknown) => {
      const id = HookIdSchema.parse(hookId);
      const validatedPayload = PayloadSchema.parse(payload);
      return hookService.testHook(id, validatedPayload);
    }
  );

  // Validate code
  ipcMain.handle('hooks:validateCode', async (_, code: unknown) => {
    const validatedCode = z.string().min(1).max(50000).parse(code);
    return hookService.validateCode(validatedCode);
  });
}
