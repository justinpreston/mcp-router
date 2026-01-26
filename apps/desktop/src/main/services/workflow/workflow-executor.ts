import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IWorkflowExecutor,
  IServerManager,
  ILogger,
  WorkflowStep,
  StepExecution,
  WorkflowExecutionContext,
} from '@main/core/interfaces';

/**
 * Executes individual workflow steps.
 * Supports tool calls, conditions, transforms, and other step types.
 */
@injectable()
export class WorkflowExecutor implements IWorkflowExecutor {
  constructor(
    @inject(TYPES.ServerManager) private serverManager: IServerManager,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async executeStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<StepExecution> {
    const execution: StepExecution = {
      stepId: step.id,
      stepName: step.name,
      status: 'running',
      startedAt: Date.now(),
      retryCount: 0,
    };

    // Check abort signal
    if (context.abortSignal?.aborted) {
      execution.status = 'cancelled';
      execution.completedAt = Date.now();
      return execution;
    }

    // Evaluate condition if present
    if (step.condition) {
      const shouldRun = this.evaluateCondition(step.condition, context);
      if (!shouldRun) {
        execution.status = 'skipped';
        execution.completedAt = Date.now();
        this.logger.debug(`Step ${step.name} skipped due to condition`, { stepId: step.id });
        return execution;
      }
    }

    // Resolve step input
    const input = this.resolveInput(step.config, context);
    execution.input = input;

    const maxRetries = step.retries ?? 0;
    let lastError: Error | null = null;

    while (execution.retryCount <= maxRetries) {
      try {
        // Execute based on step type
        const output = await this.executeStepByType(step, input, context);
        execution.output = output;
        execution.status = 'completed';
        execution.completedAt = Date.now();
        
        // Store output in context
        context.stepOutputs.set(step.id, output);
        
        this.logger.debug(`Step ${step.name} completed`, {
          stepId: step.id,
          duration: execution.completedAt - (execution.startedAt ?? 0),
        });
        
        return execution;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        execution.retryCount++;
        
        if (execution.retryCount <= maxRetries) {
          this.logger.warn(`Step ${step.name} failed, retrying`, {
            stepId: step.id,
            attempt: execution.retryCount,
            error: lastError.message,
          });
          // Exponential backoff
          await this.delay(Math.pow(2, execution.retryCount - 1) * 1000);
        }
      }
    }

    // All retries exhausted
    execution.status = 'failed';
    execution.error = lastError?.message ?? 'Unknown error';
    execution.completedAt = Date.now();
    
    this.logger.error(`Step ${step.name} failed after ${maxRetries + 1} attempts`, {
      stepId: step.id,
      error: execution.error,
    });

    return execution;
  }

  evaluateCondition(condition: string, context: WorkflowExecutionContext): boolean {
    try {
      // Create a safe evaluation context with available variables
      const evalContext = {
        input: context.input,
        steps: Object.fromEntries(context.stepOutputs),
        variables: Object.fromEntries(context.variables),
      };

      // Simple expression evaluation (supports basic comparisons)
      // In production, use a proper expression parser
      return this.safeEvaluate(condition, evalContext);
    } catch (error) {
      this.logger.warn('Condition evaluation failed, defaulting to false', {
        condition,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  transformData(config: Record<string, unknown>, input: unknown): unknown {
    const template = config.template;
    const mapping = config.mapping as Record<string, string> | undefined;

    if (mapping && typeof input === 'object' && input !== null) {
      // Apply field mapping
      const result: Record<string, unknown> = {};
      for (const [targetKey, sourcePath] of Object.entries(mapping)) {
        result[targetKey] = this.getNestedValue(input as Record<string, unknown>, sourcePath);
      }
      return result;
    }

    if (template && typeof template === 'string') {
      // Simple template substitution
      return this.interpolateTemplate(template, input as Record<string, unknown>);
    }

    return input;
  }

  private async executeStepByType(
    step: WorkflowStep,
    input: unknown,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
    const timeout = step.timeout ?? 30000;

    switch (step.type) {
      case 'tool_call':
        return this.executeToolCall(step, input, timeout);

      case 'transform':
        return this.transformData(step.config, input);

      case 'wait':
        const waitMs = (step.config.duration as number) ?? 1000;
        await this.delay(Math.min(waitMs, timeout));
        return { waited: waitMs };

      case 'condition':
        // Condition steps evaluate and return boolean
        const conditionExpr = step.config.expression as string;
        return this.evaluateCondition(conditionExpr, context);

      case 'parallel':
        // Parallel execution of substeps (simplified - full impl would need sub-executor)
        this.logger.warn('Parallel step type not fully implemented', { stepId: step.id });
        return { parallel: true, substeps: step.config.steps };

      case 'loop':
        // Loop execution (simplified)
        this.logger.warn('Loop step type not fully implemented', { stepId: step.id });
        return { loop: true, config: step.config };

      case 'webhook':
        return this.executeWebhook(step, input, timeout);

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeToolCall(
    step: WorkflowStep,
    input: unknown,
    _timeout: number
  ): Promise<unknown> {
    const { serverId, toolName } = step;

    if (!serverId || !toolName) {
      throw new Error('Tool call step requires serverId and toolName');
    }

    const server = this.serverManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status !== 'running') {
      throw new Error(`Server is not running: ${serverId}`);
    }

    // Get tools from server
    const tools = await this.serverManager.getServerTools(serverId);
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName} on server ${serverId}`);
    }

    // Note: Actual tool execution would go through McpAggregator
    // This is a simplified implementation
    this.logger.info('Executing tool call', {
      serverId,
      toolName,
      input,
    });

    // For now, return a placeholder - full implementation needs McpAggregator integration
    return {
      toolCall: true,
      serverId,
      toolName,
      input,
      result: 'Tool execution requires McpAggregator integration',
    };
  }

  private async executeWebhook(
    step: WorkflowStep,
    input: unknown,
    timeout: number
  ): Promise<unknown> {
    const url = step.config.url as string;
    const method = (step.config.method as string) ?? 'POST';
    const headers = (step.config.headers as Record<string, string>) ?? {};

    if (!url) {
      throw new Error('Webhook step requires url');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: method !== 'GET' ? JSON.stringify(input) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }
      return response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveInput(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext
  ): unknown {
    const inputSource = config.input ?? config.inputFrom;

    if (typeof inputSource === 'string') {
      // Reference to another step's output or workflow input
      if (inputSource.startsWith('$steps.')) {
        const stepId = inputSource.slice(7);
        return context.stepOutputs.get(stepId);
      }
      if (inputSource === '$input' || inputSource.startsWith('$input.')) {
        if (inputSource === '$input') {
          return context.input;
        }
        const path = inputSource.slice(7);
        return this.getNestedValue(context.input, path);
      }
      if (inputSource.startsWith('$variables.')) {
        const varName = inputSource.slice(11);
        return context.variables.get(varName);
      }
    }

    // Use config directly as input
    return config.input ?? config;
  }

  private safeEvaluate(
    expression: string,
    context: Record<string, unknown>
  ): boolean {
    // Very basic expression evaluation
    // Supports: ==, !=, >, <, >=, <=, &&, ||, !
    // In production, use a proper expression parser like expr-eval

    const expr = expression.trim();

    // Handle boolean literals
    if (expr === 'true') return true;
    if (expr === 'false') return false;

    // Handle simple comparisons
    const comparisonMatch = expr.match(
      /^([\w.]+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/
    );

    if (comparisonMatch) {
      const [, leftPath, operator, rightValue] = comparisonMatch;
      if (!leftPath || !rightValue) {
        return false;
      }
      const leftVal = this.resolvePath(leftPath, context);
      const rightParsed = this.parseValue(rightValue.trim(), context);

      switch (operator) {
        case '==':
          return leftVal === rightParsed;
        case '!=':
          return leftVal !== rightParsed;
        case '>':
          return Number(leftVal) > Number(rightParsed);
        case '<':
          return Number(leftVal) < Number(rightParsed);
        case '>=':
          return Number(leftVal) >= Number(rightParsed);
        case '<=':
          return Number(leftVal) <= Number(rightParsed);
      }
    }

    // Handle existence check
    if (expr.startsWith('exists(') && expr.endsWith(')')) {
      const path = expr.slice(7, -1);
      return this.resolvePath(path, context) !== undefined;
    }

    // Default to checking truthiness of a path
    return Boolean(this.resolvePath(expr, context));
  }

  private resolvePath(path: string, context: Record<string, unknown>): unknown {
    const parts = path.split('.');
    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private parseValue(value: string, context: Record<string, unknown>): unknown {
    // String literal
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    // Number
    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;

    // Path reference
    return this.resolvePath(value, context);
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      if (current === null || current === undefined) return undefined;
      return (current as Record<string, unknown>)[key];
    }, obj);
  }

  private interpolateTemplate(
    template: string,
    data: Record<string, unknown>
  ): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
      const value = this.getNestedValue(data, path);
      return value !== undefined ? String(value) : '';
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
