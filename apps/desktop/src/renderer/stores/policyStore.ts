import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PolicyInfo, PolicyAddConfig } from '@preload/api';
import { getElectronAPI } from '@renderer/hooks';

interface PolicyState {
  policies: PolicyInfo[];
  selectedPolicyId: string | null;
  isLoading: boolean;
  error: string | null;

  // Filters
  scopeFilter: string | null;
  scopeIdFilter: string | null;

  // Actions
  fetchPolicies: (scope?: string, scopeId?: string) => Promise<void>;
  selectPolicy: (id: string | null) => void;
  addPolicy: (config: PolicyAddConfig) => Promise<PolicyInfo>;
  updatePolicy: (id: string, updates: Partial<PolicyAddConfig>) => Promise<void>;
  removePolicy: (id: string) => Promise<void>;
  setFilters: (scope: string | null, scopeId?: string | null) => void;
  clearError: () => void;
}

export const usePolicyStore = create<PolicyState>()(
  devtools(
    (set, get) => ({
      policies: [],
      selectedPolicyId: null,
      isLoading: false,
      error: null,
      scopeFilter: null,
      scopeIdFilter: null,

      fetchPolicies: async (scope, scopeId) => {
        const api = getElectronAPI();
        if (!api) return;

        set({ isLoading: true, error: null });

        try {
          const policies = await api.policies.list(scope, scopeId);
          set({ policies, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch policies',
            isLoading: false,
          });
        }
      },

      selectPolicy: (id) => {
        set({ selectedPolicyId: id });
      },

      addPolicy: async (config) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          const policy = await api.policies.add(config);
          set((state) => ({
            policies: [...state.policies, policy],
            isLoading: false,
          }));
          return policy;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to add policy';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      updatePolicy: async (id, updates) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          const updated = await api.policies.update(id, updates);
          set((state) => ({
            policies: state.policies.map((p) => (p.id === id ? updated : p)),
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update policy';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      removePolicy: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          await api.policies.remove(id);
          set((state) => ({
            policies: state.policies.filter((p) => p.id !== id),
            selectedPolicyId: state.selectedPolicyId === id ? null : state.selectedPolicyId,
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to remove policy';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      setFilters: (scope, scopeId = null) => {
        set({ scopeFilter: scope, scopeIdFilter: scopeId });
        get().fetchPolicies(scope ?? undefined, scopeId ?? undefined);
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'policy-store' }
  )
);

// Selectors
export const selectPolicies = (state: PolicyState) => state.policies;
export const selectSelectedPolicy = (state: PolicyState) =>
  state.policies.find((p) => p.id === state.selectedPolicyId) ?? null;
export const selectEnabledPolicies = (state: PolicyState) =>
  state.policies.filter((p) => p.enabled);
export const selectPoliciesByScope = (scope: string) => (state: PolicyState) =>
  state.policies.filter((p) => p.scope === scope);
