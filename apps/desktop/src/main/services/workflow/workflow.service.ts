import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IWorkflowService,
  IWorkflowRepository,
  IWorkflowExecutionRepository,
  IWorkflowExecutor,
  ILogger,
  Workflow,
  WorkflowCreateInput,
  WorkflowExecution,
  WorkflowStep,
  WorkflowExecutionContext,
} from '@main/core/interfaces';

/**
 * Service for managing workflow definitions and executions.
 * Handles CRUD operations for workflows and orchestrates execution.
 */
@injectable()
export class WorkflowService implements IWorkflowService {
  private activeExecutions: Map<string, AbortController> = new Map();

  constructor(
    @inject(TYPES.WorkflowRepository)
    private workflowRepository: IWorkflowRepository,
    @inject(TYPES.WorkflowExecutionRepository)
    private executionRepository: IWorkflowExecutionRepository,
    @inject(TYPES.WorkflowExecutor)
    private executor: IWorkflowExecutor,
    @inject(TYPES.Logger)
    private logger: ILogger
  ) {}

  async createWorkflow(input: WorkflowCreateInput): Promise<Workflow> {
    const now = Date.now();
    const workflow: Workflow = {
      id: nanoid(),
      name: input.name,
      description: input.description,
      projectId: input.projectId,
      steps: input.steps.map((step) => ({
        ...step,
        id: nanoid(),
      })),
      trigger: input.trigger,
      inputSchema: input.inputSchema,
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.workflowRepository.create(workflow);
    this.logger.info('Workflow created', { workflowId: workflow.id, name: workflow.name });
    return workflow;
  }

  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    return this.workflowRepository.findById(workflowId);
  }

  async getAllWorkflows(): Promise<Workflow[]> {
    return this.workflowRepository.findAll();
  }

  async getWorkflowsByProject(projectId: string): Promise<Workflow[]> {
    return this.workflowRepository.findByProjectId(projectId);
  }

  async updateWorkflow(
    workflowId: string,
    updates: Partial<Workflow>
  ): Promise<Workflow> {
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Increment version on any update
    const updatedWorkflow: Workflow = {
      ...workflow,
      ...updates,
      id: workflow.id, // Preserve ID
      version: workflow.version + 1,
      updatedAt: Date.now(),
    };

    await this.workflowRepository.update(updatedWorkflow);
    this.logger.info('Workflow updated', { workflowId, version: updatedWorkflow.version });
    return updatedWorkflow;
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Cancel any active executions
    const executions = await this.executionRepository.findByWorkflowId(workflowId);
    for (const exec of executions) {
      if (exec.status === 'running' || exec.status === 'paused') {
        await this.cancelExecution(exec.id);
      }
    }

    await this.workflowRepository.delete(workflowId);
    this.logger.info('Workflow deleted', { workflowId });
  }

  async activateWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    workflow.status = 'active';
    workflow.updatedAt = Date.now();
    await this.workflowRepository.update(workflow);
    this.logger.info('Workflow activated', { workflowId });
  }

  async deactivateWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    workflow.status = 'draft';
    workflow.updatedAt = Date.now();
    await this.workflowRepository.update(workflow);
    this.logger.info('Workflow deactivated', { workflowId });
  }

  async executeWorkflow(
    workflowId: string,
    input?: Record<string, unknown>,
    triggeredBy?: string
  ): Promise<WorkflowExecution> {
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = nanoid();
    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      status: 'running',
      input: input ?? {},
      steps: workflow.steps.map((step) => ({
        stepId: step.id,
        stepName: step.name,
        status: 'pending',
        retryCount: 0,
      })),
      startedAt: Date.now(),
      triggeredBy,
    };

    await this.executionRepository.create(execution);
    this.logger.info('Workflow execution started', {
      executionId,
      workflowId,
      workflowName: workflow.name,
    });

    // Execute asynchronously
    this.runExecution(workflow, execution, abortController.signal).catch((error) => {
      this.logger.error('Workflow execution failed', {
        executionId,
        error: error.message,
      });
    });

    // Update workflow last run time
    workflow.lastRunAt = Date.now();
    await this.workflowRepository.update(workflow);

    return execution;
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    return this.executionRepository.findById(executionId);
  }

  async getExecutions(
    workflowId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<WorkflowExecution[]> {
    return this.executionRepository.findByWorkflowId(workflowId, options);
  }

  async cancelExecution(executionId: string): Promise<void> {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(executionId);
    }

    const execution = await this.executionRepository.findById(executionId);
    if (execution && (execution.status === 'running' || execution.status === 'paused')) {
      execution.status = 'cancelled';
      execution.completedAt = Date.now();
      await this.executionRepository.update(execution);
      this.logger.info('Workflow execution cancelled', { executionId });
    }
  }

  async pauseExecution(executionId: string): Promise<void> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution || execution.status !== 'running') {
      throw new Error(`Cannot pause execution: ${executionId}`);
    }

    execution.status = 'paused';
    await this.executionRepository.update(execution);
    this.logger.info('Workflow execution paused', { executionId });
  }

  async resumeExecution(executionId: string): Promise<void> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution || execution.status !== 'paused') {
      throw new Error(`Cannot resume execution: ${executionId}`);
    }

    const workflow = await this.workflowRepository.findById(execution.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${execution.workflowId}`);
    }

    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

    execution.status = 'running';
    await this.executionRepository.update(execution);

    // Resume from current step
    this.runExecution(workflow, execution, abortController.signal, true).catch((error) => {
      this.logger.error('Workflow execution failed after resume', {
        executionId,
        error: error.message,
      });
    });

    this.logger.info('Workflow execution resumed', { executionId });
  }

  private async runExecution(
    workflow: Workflow,
    execution: WorkflowExecution,
    abortSignal: AbortSignal,
    isResume: boolean = false
  ): Promise<void> {
    const context: WorkflowExecutionContext = {
      executionId: execution.id,
      workflow,
      input: execution.input ?? {},
      stepOutputs: new Map(),
      variables: new Map(),
      abortSignal,
    };

    // If resuming, restore step outputs from completed steps
    if (isResume) {
      for (const stepExec of execution.steps) {
        if (stepExec.status === 'completed' && stepExec.output !== undefined) {
          context.stepOutputs.set(stepExec.stepId, stepExec.output);
        }
      }
    }

    try {
      // Build dependency graph and execute steps
      const stepsToExecute = this.buildExecutionOrder(workflow.steps, execution, isResume);

      for (const step of stepsToExecute) {
        if (abortSignal.aborted) {
          execution.status = 'cancelled';
          break;
        }

        // Check if paused
        const currentExec = await this.executionRepository.findById(execution.id);
        if (currentExec?.status === 'paused') {
          return; // Exit, will resume later
        }

        // Wait for dependencies
        await this.waitForDependencies(step, execution);

        // Execute step
        execution.currentStepId = step.id;
        const stepIndex = execution.steps.findIndex((s) => s.stepId === step.id);
        const stepExec = execution.steps[stepIndex];
        if (stepIndex >= 0 && stepExec) {
          stepExec.status = 'running';
        }
        await this.executionRepository.update(execution);

        const stepResult = await this.executor.executeStep(step, context);

        // Update step execution
        if (stepIndex >= 0) {
          execution.steps[stepIndex] = stepResult;
        }
        await this.executionRepository.update(execution);

        // Check if we should continue on error
        if (stepResult.status === 'failed' && !step.continueOnError) {
          execution.status = 'failed';
          execution.error = `Step "${step.name}" failed: ${stepResult.error}`;
          break;
        }
      }

      // Determine final status
      if (execution.status === 'running') {
        const hasFailures = execution.steps.some((s) => s.status === 'failed');
        execution.status = hasFailures ? 'failed' : 'completed';
      }

      // Set final output from last completed step
      const lastCompleted = [...execution.steps]
        .reverse()
        .find((s) => s.status === 'completed');
      if (lastCompleted) {
        execution.output = lastCompleted.output;
      }

      execution.completedAt = Date.now();
      execution.currentStepId = undefined;
      await this.executionRepository.update(execution);

      this.logger.info('Workflow execution finished', {
        executionId: execution.id,
        status: execution.status,
        duration: execution.completedAt - execution.startedAt,
      });
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      execution.completedAt = Date.now();
      await this.executionRepository.update(execution);
      throw error;
    } finally {
      this.activeExecutions.delete(execution.id);
    }
  }

  private buildExecutionOrder(
    steps: WorkflowStep[],
    execution: WorkflowExecution,
    isResume: boolean
  ): WorkflowStep[] {
    // Topological sort based on dependencies
    const visited = new Set<string>();
    const result: WorkflowStep[] = [];
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    // If resuming, skip completed steps
    if (isResume) {
      for (const stepExec of execution.steps) {
        if (stepExec.status === 'completed' || stepExec.status === 'skipped') {
          visited.add(stepExec.stepId);
        }
      }
    }

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      visited.add(stepId);

      const step = stepMap.get(stepId);
      if (!step) return;

      // Visit dependencies first
      for (const depId of step.dependsOn ?? []) {
        visit(depId);
      }

      result.push(step);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return result;
  }

  private async waitForDependencies(
    step: WorkflowStep,
    execution: WorkflowExecution
  ): Promise<void> {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return;
    }

    for (const depId of step.dependsOn) {
      const depExec = execution.steps.find((s) => s.stepId === depId);
      if (!depExec || (depExec.status !== 'completed' && depExec.status !== 'skipped')) {
        throw new Error(`Dependency not satisfied: ${depId}`);
      }
    }
  }
}
