import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from './api';

/**
 * Expose protected methods to the renderer process via context bridge.
 * This allows secure communication between renderer and main process.
 */
const electronAPI: ElectronAPI = {
  // App information
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // Server management
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    get: (id: string) => ipcRenderer.invoke('servers:get', id),
    add: (config: unknown) => ipcRenderer.invoke('servers:add', config),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('servers:update', id, updates),
    remove: (id: string) => ipcRenderer.invoke('servers:remove', id),
    start: (id: string) => ipcRenderer.invoke('servers:start', id),
    stop: (id: string) => ipcRenderer.invoke('servers:stop', id),
    restart: (id: string) => ipcRenderer.invoke('servers:restart', id),
  },

  // Token management
  tokens: {
    list: (clientId?: string) => ipcRenderer.invoke('tokens:list', clientId),
    create: (options: unknown) => ipcRenderer.invoke('tokens:create', options),
    revoke: (tokenId: string) => ipcRenderer.invoke('tokens:revoke', tokenId),
    updateAccess: (tokenId: string, serverAccess: unknown) =>
      ipcRenderer.invoke('tokens:updateAccess', tokenId, serverAccess),
  },

  // Policy management
  policies: {
    list: (scope?: string, scopeId?: string) =>
      ipcRenderer.invoke('policies:list', scope, scopeId),
    get: (id: string) => ipcRenderer.invoke('policies:get', id),
    add: (rule: unknown) => ipcRenderer.invoke('policies:add', rule),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('policies:update', id, updates),
    remove: (id: string) => ipcRenderer.invoke('policies:remove', id),
  },

  // Approval queue
  approvals: {
    list: () => ipcRenderer.invoke('approvals:list'),
    approve: (id: string, note?: string) => ipcRenderer.invoke('approvals:approve', id, note),
    reject: (id: string, reason?: string) => ipcRenderer.invoke('approvals:reject', id, reason),
  },

  // Workspace management
  workspaces: {
    list: () => ipcRenderer.invoke('workspaces:list'),
    get: (id: string) => ipcRenderer.invoke('workspaces:get', id),
    create: (config: unknown) => ipcRenderer.invoke('workspaces:create', config),
    update: (id: string, updates: unknown) =>
      ipcRenderer.invoke('workspaces:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('workspaces:delete', id),
    addServer: (workspaceId: string, serverId: string) =>
      ipcRenderer.invoke('workspaces:addServer', workspaceId, serverId),
    removeServer: (workspaceId: string, serverId: string) =>
      ipcRenderer.invoke('workspaces:removeServer', workspaceId, serverId),
  },

  // Memory management
  memory: {
    store: (input: unknown) => ipcRenderer.invoke('memory:store', input),
    get: (id: string) => ipcRenderer.invoke('memory:get', id),
    search: (query: string, options?: unknown) =>
      ipcRenderer.invoke('memory:search', query, options),
    searchByTags: (tags: string[], options?: unknown) =>
      ipcRenderer.invoke('memory:searchByTags', tags, options),
    list: (options?: unknown) => ipcRenderer.invoke('memory:list', options),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('memory:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('memory:delete', id),
  },

  // Tool catalog
  catalog: {
    listTools: () => ipcRenderer.invoke('catalog:listTools'),
    getToolsByServer: (serverId: string) =>
      ipcRenderer.invoke('catalog:getToolsByServer', serverId),
    searchTools: (query: string) => ipcRenderer.invoke('catalog:searchTools', query),
    enableTool: (serverId: string, toolName: string) =>
      ipcRenderer.invoke('catalog:enableTool', serverId, toolName),
    disableTool: (serverId: string, toolName: string) =>
      ipcRenderer.invoke('catalog:disableTool', serverId, toolName),
    isToolEnabled: (serverId: string, toolName: string) =>
      ipcRenderer.invoke('catalog:isToolEnabled', serverId, toolName),
    refresh: () => ipcRenderer.invoke('catalog:refresh'),
  },

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'server:status-changed',
      'server:error',
      'approval:requested',
      'approval:resolved',
      'token:expired',
      'workspace:updated',
      'memory:stored',
      'catalog:refreshed',
    ];

    if (validChannels.includes(channel)) {
      const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
        callback(...args);
      ipcRenderer.on(channel, subscription);

      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }

    console.warn(`Invalid channel: ${channel}`);
    return () => {};
  },

  // One-time event listener
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'server:status-changed',
      'server:error',
      'approval:requested',
      'approval:resolved',
      'token:expired',
      'workspace:updated',
      'memory:stored',
      'catalog:refreshed',
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (_event, ...args) => callback(...args));
    } else {
      console.warn(`Invalid channel: ${channel}`);
    }
  },
};

// Expose API to renderer
contextBridge.exposeInMainWorld('electron', electronAPI);

// Type declaration for renderer process
declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
