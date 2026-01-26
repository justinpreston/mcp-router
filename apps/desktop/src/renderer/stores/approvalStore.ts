import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ApprovalInfo } from '@preload/api';
import { getElectronAPI } from '@renderer/hooks';

interface ApprovalState {
  approvals: ApprovalInfo[];
  selectedApprovalId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchApprovals: () => Promise<void>;
  selectApproval: (id: string | null) => void;
  approveRequest: (id: string, note?: string) => Promise<void>;
  rejectRequest: (id: string, reason?: string) => Promise<void>;
  handleNewApproval: (approval: ApprovalInfo) => void;
  handleApprovalResolved: (approval: ApprovalInfo) => void;
  clearError: () => void;
}

export const useApprovalStore = create<ApprovalState>()(
  devtools(
    (set) => ({
      approvals: [],
      selectedApprovalId: null,
      isLoading: false,
      error: null,

      fetchApprovals: async () => {
        const api = getElectronAPI();
        if (!api) return;

        set({ isLoading: true, error: null });

        try {
          const approvals = await api.approvals.list();
          set({ approvals, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch approvals',
            isLoading: false,
          });
        }
      },

      selectApproval: (id) => {
        set({ selectedApprovalId: id });
      },

      approveRequest: async (id, note) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          await api.approvals.approve(id, note);
          set((state) => ({
            approvals: state.approvals.filter((a) => a.id !== id),
            selectedApprovalId: state.selectedApprovalId === id ? null : state.selectedApprovalId,
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to approve request';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      rejectRequest: async (id, reason) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          await api.approvals.reject(id, reason);
          set((state) => ({
            approvals: state.approvals.filter((a) => a.id !== id),
            selectedApprovalId: state.selectedApprovalId === id ? null : state.selectedApprovalId,
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to reject request';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      handleNewApproval: (approval) => {
        set((state) => ({
          approvals: [...state.approvals, approval],
        }));
      },

      handleApprovalResolved: (approval) => {
        set((state) => ({
          approvals: state.approvals.filter((a) => a.id !== approval.id),
          selectedApprovalId:
            state.selectedApprovalId === approval.id ? null : state.selectedApprovalId,
        }));
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'approval-store' }
  )
);

// Selectors
export const selectApprovals = (state: ApprovalState) => state.approvals;
export const selectSelectedApproval = (state: ApprovalState) =>
  state.approvals.find((a) => a.id === state.selectedApprovalId) ?? null;
export const selectPendingCount = (state: ApprovalState) =>
  state.approvals.filter((a) => a.status === 'pending').length;
