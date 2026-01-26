import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type { IApprovalQueue, ILogger } from '@main/core/interfaces';
import { ApprovalQueueService } from '../approval-queue.service';
import { createMockLogger } from '@tests/utils';

describe('ApprovalQueueService', () => {
  let container: Container;
  let approvalQueue: IApprovalQueue;
  let mockLogger: ILogger;

  beforeEach(() => {
    vi.useFakeTimers();
    container = new Container();
    mockLogger = createMockLogger();

    container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);
    container.bind<IApprovalQueue>(TYPES.ApprovalQueue).to(ApprovalQueueService);

    approvalQueue = container.get<IApprovalQueue>(TYPES.ApprovalQueue);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createRequest', () => {
    it('should create an approval request with generated ID', async () => {
      const request = await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'dangerous_tool',
        toolArguments: { path: '/etc/passwd' },
        policyRuleId: 'rule-1',
      });

      expect(request.id).toMatch(/^approval-/);
      expect(request.status).toBe('pending');
      expect(request.clientId).toBe('client-1');
      expect(request.toolName).toBe('dangerous_tool');
      expect(request.requestedAt).toBeDefined();
      expect(request.expiresAt).toBeGreaterThan(request.requestedAt);
    });

    it('should log request creation', async () => {
      await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'test_tool',
        toolArguments: {},
        policyRuleId: 'rule-1',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Approval request created',
        expect.objectContaining({ toolName: 'test_tool' })
      );
    });
  });

  describe('waitForApproval', () => {
    it('should timeout after specified duration', async () => {
      const request = await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'test_tool',
        toolArguments: {},
        policyRuleId: 'rule-1',
      });

      const promise = approvalQueue.waitForApproval(request.id, 1000);

      // Advance time past timeout
      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow('timed out');
    });

    it('should resolve when approved', async () => {
      const request = await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'test_tool',
        toolArguments: {},
        policyRuleId: 'rule-1',
      });

      const promise = approvalQueue.waitForApproval(request.id);

      // Approve the request
      await approvalQueue.respond(request.id, {
        approved: true,
        respondedBy: 'admin',
      });

      const result = await promise;
      expect(result.approved).toBe(true);
    });

    it('should resolve with rejection when denied', async () => {
      const request = await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'test_tool',
        toolArguments: {},
        policyRuleId: 'rule-1',
      });

      const promise = approvalQueue.waitForApproval(request.id);

      // Reject the request
      await approvalQueue.respond(request.id, {
        approved: false,
        respondedBy: 'admin',
        reason: 'Too dangerous',
      });

      const result = await promise;
      expect(result.approved).toBe(false);
    });
  });

  describe('respond', () => {
    it('should resolve waiting promise with approval', async () => {
      const request = await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'test_tool',
        toolArguments: {},
        policyRuleId: 'rule-1',
      });

      const waitPromise = approvalQueue.waitForApproval(request.id);

      await approvalQueue.respond(request.id, {
        approved: true,
        respondedBy: 'user-1',
      });

      const result = await waitPromise;
      expect(result.approved).toBe(true);
    });

    it('should throw for responding to non-existent request', async () => {
      await expect(
        approvalQueue.respond('non-existent', {
          approved: true,
          respondedBy: 'admin',
        })
      ).rejects.toThrow('not found');
    });
  });

  describe('getPendingRequests', () => {
    it('should return all pending requests', async () => {
      // Create some requests
      const req1 = await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'tool1',
        toolArguments: {},
        policyRuleId: 'rule-1',
      });

      const req2 = await approvalQueue.createRequest({
        clientId: 'client-2',
        serverId: 'server-2',
        toolName: 'tool2',
        toolArguments: {},
        policyRuleId: 'rule-2',
      });

      // Start waiting (adds to pending)
      approvalQueue.waitForApproval(req1.id);
      approvalQueue.waitForApproval(req2.id);

      const pending = await approvalQueue.getPendingRequests();

      expect(pending.length).toBe(2);
    });

    it('should return empty array when no pending requests', async () => {
      const pending = await approvalQueue.getPendingRequests();

      expect(pending).toEqual([]);
    });
  });

  describe('cancelRequest', () => {
    it('should cancel a pending request', async () => {
      const request = await approvalQueue.createRequest({
        clientId: 'client-1',
        serverId: 'server-1',
        toolName: 'test_tool',
        toolArguments: {},
        policyRuleId: 'rule-1',
      });

      const promise = approvalQueue.waitForApproval(request.id);

      // Cancel should reject the waiting promise
      await approvalQueue.cancelRequest(request.id);

      await expect(promise).rejects.toThrow();
    });
  });
});
