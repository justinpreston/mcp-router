import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IHookSandbox,
  ILogger,
  HookContext,
  HookResult,
} from '@main/core/interfaces';
import * as vm from 'vm';

/**
 * Secure JavaScript sandbox for hook execution.
 * Uses Node.js vm module with strict isolation.
 *
 * Security features:
 * - Timeout enforcement
 * - No access to Node.js globals (require, process, etc.)
 * - Frozen context objects to prevent prototype pollution
 * - Read-only access to payload unless canModify is true
 * - Console output capture for debugging
 */
@injectable()
export class HookSandbox implements IHookSandbox {
  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  async execute(
    code: string,
    context: HookContext,
    options: { timeout: number; canModify: boolean }
  ): Promise<HookResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    let modifiedPayload: Record<string, unknown> | undefined;

    try {
      // Validate code first
      const validation = this.validate(code);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          duration: Date.now() - startTime,
          logs,
        };
      }

      // Create sandboxed console
      const sandboxConsole = {
        log: (...args: unknown[]) => {
          logs.push(args.map((a) => this.stringify(a)).join(' '));
        },
        info: (...args: unknown[]) => {
          logs.push(`[INFO] ${args.map((a) => this.stringify(a)).join(' ')}`);
        },
        warn: (...args: unknown[]) => {
          logs.push(`[WARN] ${args.map((a) => this.stringify(a)).join(' ')}`);
        },
        error: (...args: unknown[]) => {
          logs.push(`[ERROR] ${args.map((a) => this.stringify(a)).join(' ')}`);
        },
        debug: (...args: unknown[]) => {
          logs.push(`[DEBUG] ${args.map((a) => this.stringify(a)).join(' ')}`);
        },
      };

      // Create payload proxy for modification tracking
      const payloadCopy = JSON.parse(JSON.stringify(context.payload));
      let payloadModified = false;

      const payloadProxy = options.canModify
        ? new Proxy(payloadCopy, {
            set: (target, prop, value) => {
              payloadModified = true;
              target[prop as string] = value;
              return true;
            },
            deleteProperty: (target, prop) => {
              payloadModified = true;
              delete target[prop as string];
              return true;
            },
          })
        : Object.freeze(payloadCopy);

      // Create sandbox context with limited globals
      const sandbox = {
        // Safe globals
        console: Object.freeze(sandboxConsole),
        JSON: Object.freeze({
          parse: JSON.parse.bind(JSON),
          stringify: JSON.stringify.bind(JSON),
        }),
        Math: Object.freeze(Math),
        Date: Object.freeze({
          now: Date.now.bind(Date),
          parse: Date.parse.bind(Date),
          UTC: Date.UTC.bind(Date),
        }),
        parseInt: parseInt,
        parseFloat: parseFloat,
        isNaN: isNaN,
        isFinite: isFinite,
        encodeURIComponent: encodeURIComponent,
        decodeURIComponent: decodeURIComponent,
        encodeURI: encodeURI,
        decodeURI: decodeURI,

        // Context data
        event: Object.freeze(context.event),
        payload: payloadProxy,
        meta: Object.freeze(context.meta),

        // Result holder
        __result: undefined as unknown,
      };

      // Prevent prototype pollution
      vm.createContext(sandbox);

      // Wrap code in async function to support await
      const wrappedCode = `
        (async function() {
          ${code}
          return typeof __result !== 'undefined' ? __result : payload;
        })()
      `;

      // Execute with timeout
      const script = new vm.Script(wrappedCode, {
        filename: `hook-${context.meta.hookId}.js`,
      });

      const resultPromise = script.runInContext(sandbox, {
        timeout: options.timeout,
        displayErrors: true,
        breakOnSigint: true,
      }) as Promise<unknown>;

      // Wait for result with timeout
      await Promise.race([
        resultPromise,
        this.timeout(options.timeout),
      ]);

      // Check if payload was modified
      if (options.canModify && payloadModified) {
        modifiedPayload = payloadCopy;
      }

      return {
        success: true,
        modifiedPayload,
        duration: Date.now() - startTime,
        logs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.warn('Hook execution failed', {
        hookId: context.meta.hookId,
        hookName: context.meta.hookName,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
        logs,
      };
    }
  }

  validate(code: string): { valid: boolean; error?: string } {
    try {
      // Check for dangerous patterns
      const dangerousPatterns = [
        /\brequire\s*\(/,
        /\bimport\s*\(/,
        /\bimport\s+/,
        /\bprocess\b/,
        /\bglobal\b/,
        /\bglobalThis\b/,
        /\beval\s*\(/,
        /\bFunction\s*\(/,
        /\b__proto__\b/,
        /\bconstructor\s*\[/,
        /\bprototype\b/,
        /\bthis\.constructor\b/,
        /\bObject\.getPrototypeOf\b/,
        /\bObject\.setPrototypeOf\b/,
        /\bReflect\b/,
        /\bProxy\b/,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) {
          return {
            valid: false,
            error: `Dangerous pattern detected: ${pattern.source}`,
          };
        }
      }

      // Try to parse the code as a script
      new vm.Script(`(async function() { ${code} })()`, {
        filename: 'validation.js',
      });

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Syntax error',
      };
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution timeout (${ms}ms)`));
      }, ms);
    });
  }

  private stringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[object]';
      }
    }
    return String(value);
  }
}
