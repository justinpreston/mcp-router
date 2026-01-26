import { useCallback } from 'react';
import { useElectron } from './useElectron';
import type { PolicyInfo, PolicyAddConfig } from '@preload/api';

/**
 * Hook for policy management operations.
 */
export function usePolicies() {
  const api = useElectron();

  const listPolicies = useCallback(
    async (scope?: string, scopeId?: string): Promise<PolicyInfo[]> => {
      return api.policies.list(scope, scopeId);
    },
    [api]
  );

  const getPolicy = useCallback(
    async (id: string): Promise<PolicyInfo | null> => {
      return api.policies.get(id);
    },
    [api]
  );

  const addPolicy = useCallback(
    async (config: PolicyAddConfig): Promise<PolicyInfo> => {
      return api.policies.add(config);
    },
    [api]
  );

  const updatePolicy = useCallback(
    async (id: string, updates: Partial<PolicyAddConfig>): Promise<PolicyInfo> => {
      return api.policies.update(id, updates);
    },
    [api]
  );

  const removePolicy = useCallback(
    async (id: string): Promise<void> => {
      return api.policies.remove(id);
    },
    [api]
  );

  return {
    listPolicies,
    getPolicy,
    addPolicy,
    updatePolicy,
    removePolicy,
  };
}
