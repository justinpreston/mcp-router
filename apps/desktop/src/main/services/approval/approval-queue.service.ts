import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IApprovalQueue,
  ILogger,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalResult,
} from '@main/core/interfaces';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Approval queue service for managing tool call approvals.
 * Implements the approval workflow for high-risk operations.
 */
@injectable()
export class ApprovalQueueService implements IApprovalQueue {
  private pendingRequests: Map<string, {
    request: ApprovalRequest;
    resolve: (result: ApprovalResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  async createRequest(
    request: Omit<ApprovalRequest, 'id' | 'status' | 'requestedAt' | 'expiresAt'>
  ): Promise<ApprovalRequest> {
    const now = Date.now();
    const id = `approval-${nanoid(12)}`;

    const approvalRequest: ApprovalRequest = {
      id,
      ...request,
      status: 'pending',
      requestedAt: now,
      expiresAt: now + DEFAULT_TIMEOUT_MS,
    };

    this.logger.info('Approval request created', {
      requestId: id,
      toolName: request.toolName,
      serverId: request.serverId,
    });

    return approvalRequest;
  }

  async waitForApproval(
    requestId: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<ApprovalResult> {
    const existing = this.pendingRequests.get(requestId);
    if (existing) {
      // Already waiting, return the same promise result when resolved
      return new Promise((resolve, reject) => {
        const originalResolve = existing.resolve;
        const originalReject = existing.reject;

        existing.resolve = (result) => {
          originalResolve(result);
          resolve(result);
        };
        existing.reject = (error) => {
          originalReject(error);
          reject(error);
        };
      });
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.logger.warn('Approval request timed out', { requestId });
        reject(new Error('Approval request timed out'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        request: {
          id: requestId,
          clientId: '',
          serverId: '',
          toolName: '',
          toolArguments: {},
          policyRuleId: '',
          status: 'pending',
          requestedAt: Date.now(),
          expiresAt: Date.now() + timeoutMs,
        },
        resolve,
        reject,
        timeout,
      });
    });
  }

  async respond(requestId: string, response: ApprovalResponse): Promise<void> {
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      throw new Error(`Approval request not found or expired: ${requestId}`);
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    pending.request.status = response.approved ? 'approved' : 'rejected';
    pending.request.respondedAt = Date.now();
    pending.request.respondedBy = response.respondedBy;
    pending.request.responseNote = response.note;

    this.logger.info('Approval request responded', {
      requestId,
      approved: response.approved,
    });

    pending.resolve({
      approved: response.approved,
      reason: response.note,
    });
  }

  async getPendingRequests(): Promise<ApprovalRequest[]> {
    const requests: ApprovalRequest[] = [];

    for (const { request } of this.pendingRequests.values()) {
      if (request.status === 'pending') {
        requests.push(request);
      }
    }

    return requests;
  }

  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    const pending = this.pendingRequests.get(requestId);
    return pending?.request ?? null;
  }

  async cancelRequest(requestId: string): Promise<void> {
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    this.logger.info('Approval request cancelled', { requestId });
    pending.reject(new Error('Approval request cancelled'));
  }

  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [id, { request, timeout, reject }] of this.pendingRequests.entries()) {
      if (request.expiresAt < now) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(new Error('Approval request expired'));
        count++;
      }
    }

    if (count > 0) {
      this.logger.info('Cleaned up expired approval requests', { count });
    }

    return count;
  }
}
