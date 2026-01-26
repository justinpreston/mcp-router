import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import { z } from 'zod';
import { TYPES } from '@main/core/types';
import type { IWorkflowService } from '@main/core/interfaces';

// ============================================================================
// Zod Schemas
// ============================================================================

const WorkflowIdSchema = z.string().min(1, 'Workflow ID is required');
const ExecutionIdSchema = z.string().min(1, 'Execution ID is required');

const WorkflowStepTypeSchema = z.enum([
  'tool_call',
  'condition',
  'loop',
  'parallel',
  'wait',
  'transform',
  'webhook',
]);

const WorkflowStepSchema = z.object({
  name: z.string().min(1).max(100),
  type: WorkflowStepTypeSchema,
  serverId: z.string().optional(),
  toolName: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  dependsOn: z.array(z.string()).optional(),
  condition: z.string().optional(),
  timeout: z.number().positive().optional(),
  retries: z.number().int().min(0).max(10).optional(),
  continueOnError: z.boolean().optional(),
});

const TriggerTypeSchema = z.enum(['manual', 'schedule', 'webhook', 'event']);

const WorkflowTriggerSchema = z.object({
  type: TriggerTypeSchema,
  schedule: z.string().optional(),
  eventPattern: z.string().optional(),
  webhookPath: z.string().optional(),
  enabled: z.boolean().default(true),
});

const WorkflowCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  projectId: z.string().optional(),
  steps: z.array(WorkflowStepSchema).min(1),
  trigger: WorkflowTriggerSchema.optional(),
  inputSchema: z.record(z.unknown()).optional(),
});

const WorkflowUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  projectId: z.string().optional(),
  steps: z.array(WorkflowStepSchema.extend({ id: z.string() })).optional(),
  trigger: WorkflowTriggerSchema.optional(),
  inputSchema: z.record(z.unknown()).optional(),
});

const ExecuteInputSchema = z.record(z.unknown()).optional();

const PaginationSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerWorkflowHandlers(container: Container): void {
  const workflowService = container.get<IWorkflowService>(TYPES.WorkflowService);

  // List all workflows
  ipcMain.handle('workflows:list', async () => {
    return workflowService.getAllWorkflows();
  });

  // Get workflow by ID
  ipcMain.handle('workflows:get', async (_, workflowId: unknown) => {
    const id = WorkflowIdSchema.parse(workflowId);
    return workflowService.getWorkflow(id);
  });

  // Get workflows by project
  ipcMain.handle('workflows:getByProject', async (_, projectId: unknown) => {
    const id = z.string().min(1).parse(projectId);
    return workflowService.getWorkflowsByProject(id);
  });

  // Create workflow
  ipcMain.handle('workflows:create', async (_, input: unknown) => {
    const validated = WorkflowCreateSchema.parse(input);
    return workflowService.createWorkflow(validated);
  });

  // Update workflow
  ipcMain.handle(
    'workflows:update',
    async (_, workflowId: unknown, updates: unknown) => {
      const id = WorkflowIdSchema.parse(workflowId);
      const validated = WorkflowUpdateSchema.parse(updates);
      return workflowService.updateWorkflow(id, validated);
    }
  );

  // Delete workflow
  ipcMain.handle('workflows:delete', async (_, workflowId: unknown) => {
    const id = WorkflowIdSchema.parse(workflowId);
    await workflowService.deleteWorkflow(id);
  });

  // Activate workflow
  ipcMain.handle('workflows:activate', async (_, workflowId: unknown) => {
    const id = WorkflowIdSchema.parse(workflowId);
    await workflowService.activateWorkflow(id);
  });

  // Deactivate workflow
  ipcMain.handle('workflows:deactivate', async (_, workflowId: unknown) => {
    const id = WorkflowIdSchema.parse(workflowId);
    await workflowService.deactivateWorkflow(id);
  });

  // Execute workflow
  ipcMain.handle(
    'workflows:execute',
    async (_, workflowId: unknown, input?: unknown, triggeredBy?: unknown) => {
      const id = WorkflowIdSchema.parse(workflowId);
      const validatedInput = ExecuteInputSchema.parse(input);
      const validatedTriggeredBy = triggeredBy
        ? z.string().parse(triggeredBy)
        : undefined;
      return workflowService.executeWorkflow(id, validatedInput, validatedTriggeredBy);
    }
  );

  // Get execution by ID
  ipcMain.handle('workflows:getExecution', async (_, executionId: unknown) => {
    const id = ExecutionIdSchema.parse(executionId);
    return workflowService.getExecution(id);
  });

  // Get executions for workflow
  ipcMain.handle(
    'workflows:getExecutions',
    async (_, workflowId: unknown, options?: unknown) => {
      const id = WorkflowIdSchema.parse(workflowId);
      const paginationOptions = options ? PaginationSchema.parse(options) : undefined;
      return workflowService.getExecutions(id, paginationOptions);
    }
  );

  // Cancel execution
  ipcMain.handle('workflows:cancelExecution', async (_, executionId: unknown) => {
    const id = ExecutionIdSchema.parse(executionId);
    await workflowService.cancelExecution(id);
  });

  // Pause execution
  ipcMain.handle('workflows:pauseExecution', async (_, executionId: unknown) => {
    const id = ExecutionIdSchema.parse(executionId);
    await workflowService.pauseExecution(id);
  });

  // Resume execution
  ipcMain.handle('workflows:resumeExecution', async (_, executionId: unknown) => {
    const id = ExecutionIdSchema.parse(executionId);
    await workflowService.resumeExecution(id);
  });
}
