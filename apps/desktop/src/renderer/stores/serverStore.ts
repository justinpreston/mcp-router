import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { MCPServerInfo, ServerAddConfig } from '@preload/api';
import { getElectronAPI } from '@renderer/hooks';

interface ServerState {
  servers: MCPServerInfo[];
  serverOrder: string[]; // Array of server IDs in display order
  selectedServerId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchServers: () => Promise<void>;
  selectServer: (id: string | null) => void;
  addServer: (config: ServerAddConfig) => Promise<MCPServerInfo>;
  updateServer: (id: string, updates: Partial<ServerAddConfig>) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  restartServer: (id: string) => Promise<void>;
  handleStatusChange: (server: MCPServerInfo) => void;
  reorderServers: (sourceIndex: number, destIndex: number) => void;
  clearError: () => void;
}

export const useServerStore = create<ServerState>()(
  devtools(
    persist(
      (set, get) => ({
        servers: [],
        serverOrder: [],
        selectedServerId: null,
        isLoading: false,
        error: null,

        fetchServers: async () => {
          const api = getElectronAPI();
          if (!api) return;

          set({ isLoading: true, error: null });

          try {
            const servers = await api.servers.list();
            // Initialize order with any new servers, maintaining existing order
            const currentOrder = get().serverOrder;
            const existingIds = new Set(currentOrder);
            const newIds = servers.filter((s) => !existingIds.has(s.id)).map((s) => s.id);
            const validOrder = currentOrder.filter((id) =>
              servers.some((s) => s.id === id)
            );
            set({
              servers,
              serverOrder: [...validOrder, ...newIds],
              isLoading: false,
            });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to fetch servers',
              isLoading: false,
            });
          }
        },

        selectServer: (id) => {
          set({ selectedServerId: id });
        },

        addServer: async (config) => {
          const api = getElectronAPI();
          if (!api) throw new Error('Electron API not available');

          set({ isLoading: true, error: null });

          try {
            const server = await api.servers.add(config);
            set((state) => ({
              servers: [...state.servers, server],
              serverOrder: [...state.serverOrder, server.id],
              isLoading: false,
            }));
            return server;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to add server';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      updateServer: async (id, updates) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          const updated = await api.servers.update(id, updates);
          set((state) => ({
            servers: state.servers.map((s) => (s.id === id ? updated : s)),
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update server';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      removeServer: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          await api.servers.remove(id);
          set((state) => ({
            servers: state.servers.filter((s) => s.id !== id),
            serverOrder: state.serverOrder.filter((sId) => sId !== id),
            selectedServerId: state.selectedServerId === id ? null : state.selectedServerId,
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to remove server';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      startServer: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        // Optimistically update status
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, status: 'starting' as const } : s
          ),
        }));

        try {
          await api.servers.start(id);
        } catch (error) {
          // Revert on error
          await get().fetchServers();
          throw error;
        }
      },

      stopServer: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        // Optimistically update status
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, status: 'stopping' as const } : s
          ),
        }));

        try {
          await api.servers.stop(id);
        } catch (error) {
          // Revert on error
          await get().fetchServers();
          throw error;
        }
      },

      restartServer: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        // Optimistically update status
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, status: 'starting' as const } : s
          ),
        }));

        try {
          await api.servers.restart(id);
        } catch (error) {
          // Revert on error
          await get().fetchServers();
          throw error;
        }
      },

      handleStatusChange: (server) => {
        set((state) => ({
          servers: state.servers.map((s) => (s.id === server.id ? server : s)),
        }));
      },

      reorderServers: (sourceIndex, destIndex) => {
        set((state) => {
          const newOrder = [...state.serverOrder];
          const [removed] = newOrder.splice(sourceIndex, 1);
          newOrder.splice(destIndex, 0, removed);
          return { serverOrder: newOrder };
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'server-store',
      partialize: (state) => ({ serverOrder: state.serverOrder }),
    }
  ),
  { name: 'server-store' }
)
);

// Selectors
export const selectServers = (state: ServerState) => {
  // Return servers in the order specified by serverOrder
  const orderMap = new Map(state.serverOrder.map((id, idx) => [id, idx]));
  return [...state.servers].sort((a, b) => {
    const orderA = orderMap.get(a.id) ?? Infinity;
    const orderB = orderMap.get(b.id) ?? Infinity;
    return orderA - orderB;
  });
};
export const selectServerOrder = (state: ServerState) => state.serverOrder;
export const selectSelectedServer = (state: ServerState) =>
  state.servers.find((s) => s.id === state.selectedServerId) ?? null;
export const selectRunningServers = (state: ServerState) =>
  state.servers.filter((s) => s.status === 'running');
export const selectServerById = (id: string) => (state: ServerState) =>
  state.servers.find((s) => s.id === id) ?? null;
