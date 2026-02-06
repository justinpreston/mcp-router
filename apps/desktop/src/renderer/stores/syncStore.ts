import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ClientAppInfo, ClientMCPServerConfigInfo, SyncResultInfo } from '@preload/api';
import { getElectronAPI } from '@renderer/hooks';

interface SyncState {
  clients: ClientAppInfo[];
  selectedClientId: string | null;
  clientServers: Record<string, ClientMCPServerConfigInfo> | null;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncResult: SyncResultInfo | null;
  error: string | null;

  // Actions
  fetchClients: () => Promise<void>;
  selectClient: (clientId: string | null) => void;
  fetchClientServers: (clientId: string) => Promise<void>;
  importFromClient: (clientId: string) => Promise<SyncResultInfo>;
  exportToClient: (clientId: string, serverIds?: string[]) => Promise<SyncResultInfo>;
  clearError: () => void;
  clearSyncResult: () => void;
}

export const useSyncStore = create<SyncState>()(
  devtools(
    (set, get) => ({
      clients: [],
      selectedClientId: null,
      clientServers: null,
      isLoading: false,
      isSyncing: false,
      lastSyncResult: null,
      error: null,

      fetchClients: async () => {
        const api = getElectronAPI();
        if (!api) return;

        set({ isLoading: true, error: null });

        try {
          const clients = await api.sync.listClients();
          set({
            clients,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch clients',
            isLoading: false,
          });
        }
      },

      selectClient: (clientId: string | null) => {
        set({ selectedClientId: clientId, clientServers: null });
        if (clientId) {
          get().fetchClientServers(clientId);
        }
      },

      fetchClientServers: async (clientId: string) => {
        const api = getElectronAPI();
        if (!api) return;

        try {
          const servers = await api.sync.getClientServers(clientId);
          set({ clientServers: servers });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch client servers',
          });
        }
      },

      importFromClient: async (clientId: string) => {
        const api = getElectronAPI();
        if (!api) throw new Error('API not available');

        set({ isSyncing: true, error: null, lastSyncResult: null });

        try {
          const result = await api.sync.importFromClient(clientId);
          set({
            isSyncing: false,
            lastSyncResult: result,
          });
          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Import failed';
          set({
            error: errorMsg,
            isSyncing: false,
          });
          throw error;
        }
      },

      exportToClient: async (clientId: string, serverIds?: string[]) => {
        const api = getElectronAPI();
        if (!api) throw new Error('API not available');

        set({ isSyncing: true, error: null, lastSyncResult: null });

        try {
          const result = await api.sync.exportToClient(clientId, serverIds);
          set({
            isSyncing: false,
            lastSyncResult: result,
          });
          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Export failed';
          set({
            error: errorMsg,
            isSyncing: false,
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),
      clearSyncResult: () => set({ lastSyncResult: null }),
    }),
    { name: 'sync-store' }
  )
);
