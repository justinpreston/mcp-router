import { useCallback } from 'react';
import { useElectron, useElectronEvent } from './useElectron';
import type { ApprovalInfo } from '@preload/api';

/**
 * Hook for approval queue operations.
 */
export function useApprovals() {
  const api = useElectron();

  const listApprovals = useCallback(async (): Promise<ApprovalInfo[]> => {
    return api.approvals.list();
  }, [api]);

  const approveRequest = useCallback(
    async (id: string, note?: string): Promise<void> => {
      return api.approvals.approve(id, note);
    },
    [api]
  );

  const rejectRequest = useCallback(
    async (id: string, reason?: string): Promise<void> => {
      return api.approvals.reject(id, reason);
    },
    [api]
  );

  return {
    listApprovals,
    approveRequest,
    rejectRequest,
  };
}

/**
 * Hook to subscribe to new approval requests.
 */
export function useApprovalRequested(callback: (approval: ApprovalInfo) => void): void {
  useElectronEvent('approval:requested', callback);
}

/**
 * Hook to subscribe to approval resolution events.
 */
export function useApprovalResolved(callback: (approval: ApprovalInfo) => void): void {
  useElectronEvent('approval:resolved', callback);
}
