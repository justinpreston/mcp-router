import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { PolicyInfo, PolicyAddConfig } from '@preload/api';
import { getElectronAPI } from '@renderer/hooks';

interface PolicyState {
  policies: PolicyInfo[];
  policyOrder: string[]; // Local ordering (used when priorities are equal)
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
  reorderPolicies: (sourceIndex: number, destIndex: number) => Promise<void>;
  setFilters: (scope: string | null, scopeId?: string | null) => void;
  clearError: () => void;
}

export const usePolicyStore = create<PolicyState>()(
  devtools(
    persist(
      (set, get) => ({
        policies: [],
        policyOrder: [],
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
            // Initialize order with any new policies
            const currentOrder = get().policyOrder;
            const existingIds = new Set(currentOrder);
            const newIds = policies.filter((p) => !existingIds.has(p.id)).map((p) => p.id);
            const validOrder = currentOrder.filter((id) =>
              policies.some((p) => p.id === id)
            );
            set({
              policies,
              policyOrder: [...validOrder, ...newIds],
              isLoading: false,
            });
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
            policyOrder: [...state.policyOrder, policy.id],
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
            policyOrder: state.policyOrder.filter((pId) => pId !== id),
            selectedPolicyId: state.selectedPolicyId === id ? null : state.selectedPolicyId,
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to remove policy';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      reorderPolicies: async (sourceIndex, destIndex) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        // Optimistically update order
        const currentPolicies = get().policies;
        const orderedPolicies = selectPolicies(get());
        const newOrder = [...get().policyOrder];
        const [removed] = newOrder.splice(sourceIndex, 1);
        newOrder.splice(destIndex, 0, removed);
        set({ policyOrder: newOrder });

        // Update priorities on server (new index = new priority)
        try {
          const policyToMove = orderedPolicies[sourceIndex];
          const newPriority = destIndex;
          await api.policies.update(policyToMove.id, { priority: newPriority });
          // Refresh to get server-reconciled priorities
          await get().fetchPolicies(
            get().scopeFilter ?? undefined,
            get().scopeIdFilter ?? undefined
          );
        } catch (error) {
          // Revert on error
          set({
            policies: currentPolicies,
            error: error instanceof Error ? error.message : 'Failed to reorder policy',
          });
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
    {
      name: 'policy-store',
      partialize: (state) => ({ policyOrder: state.policyOrder }),
    }
  ),
  { name: 'policy-store' }
)
);

// Selectors
export const selectPolicies = (state: PolicyState) => {
  // Return policies sorted by priority first, then by local order
  const orderMap = new Map(state.policyOrder.map((id, idx) => [id, idx]));
  return [...state.policies].sort((a, b) => {
    // First sort by priority (lower = higher priority)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Then by local order
    const orderA = orderMap.get(a.id) ?? Infinity;
    const orderB = orderMap.get(b.id) ?? Infinity;
    return orderA - orderB;
  });
};
export const selectPolicyOrder = (state: PolicyState) => state.policyOrder;
export const selectSelectedPolicy = (state: PolicyState) =>
  state.policies.find((p) => p.id === state.selectedPolicyId) ?? null;
export const selectEnabledPolicies = (state: PolicyState) =>
  state.policies.filter((p) => p.enabled);
export const selectPoliciesByScope = (scope: string) => (state: PolicyState) =>
  state.policies.filter((p) => p.scope === scope);
