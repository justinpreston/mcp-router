# ADR-004: Use Zustand for UI State Management

## Status

Accepted

## Context

The renderer process needs state management for:
- Server list and status
- Policy configurations
- Approval queue
- UI state (selected items, dialogs, etc.)

Requirements:
- Must integrate well with React
- Should be simple and lightweight
- Needs to support async actions (IPC calls)
- Should enable easy debugging
- Must handle real-time updates from main process

## Decision

We will use **Zustand** for state management in the renderer process.

Key implementation details:
- Separate stores for major domains (servers, policies, approvals)
- Devtools middleware for debugging
- Actions include IPC calls and optimistic updates
- Event listeners for real-time updates from main process

## Consequences

### Positive

1. **Simplicity**: Minimal boilerplate, just functions and state
2. **TypeScript**: Excellent TypeScript support
3. **React integration**: Works with hooks, no providers needed
4. **Bundle size**: Very small (~1KB)
5. **Flexibility**: No prescribed patterns, use what works
6. **Devtools**: Redux DevTools integration via middleware
7. **Selectors**: Built-in selector support for performance

### Negative

1. **Less structured**: No enforced patterns (can be messy without discipline)
2. **Middleware syntax**: Can be complex for advanced use cases
3. **No time-travel**: Simpler devtools than Redux

### Code Example

```typescript
// stores/serverStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ServerState {
  servers: MCPServer[];
  selectedServerId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchServers: () => Promise<void>;
  selectServer: (id: string) => void;
  startServer: (id: string) => Promise<void>;
  handleStatusChange: (server: MCPServer) => void;
}

export const useServerStore = create<ServerState>()(
  devtools(
    (set, get) => ({
      servers: [],
      selectedServerId: null,
      isLoading: false,
      error: null,

      fetchServers: async () => {
        set({ isLoading: true, error: null });
        try {
          const servers = await window.electron.servers.list();
          set({ servers, isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
        }
      },

      selectServer: (id) => set({ selectedServerId: id }),

      startServer: async (id) => {
        // Optimistic update
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, status: 'starting' } : s
          ),
        }));

        await window.electron.servers.start(id);
      },

      handleStatusChange: (server) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === server.id ? server : s
          ),
        }));
      },
    }),
    { name: 'server-store' }
  )
);

// Selectors
export const selectServers = (state: ServerState) => state.servers;
export const selectSelectedServer = (state: ServerState) =>
  state.servers.find((s) => s.id === state.selectedServerId) ?? null;
```

### Usage in Components

```tsx
function ServerList() {
  const servers = useServerStore(selectServers);
  const { fetchServers, startServer } = useServerStore();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return (
    <ul>
      {servers.map((server) => (
        <li key={server.id}>
          {server.name}
          <button onClick={() => startServer(server.id)}>Start</button>
        </li>
      ))}
    </ul>
  );
}
```

## Alternatives Considered

### Redux Toolkit

**Pros**: Mature, structured, great devtools, time-travel debugging
**Cons**: More boilerplate, larger bundle, steeper learning curve

**Why not chosen**: Overkill for our relatively simple UI state needs.

### MobX

**Pros**: Automatic reactivity, minimal boilerplate
**Cons**: Larger bundle, magic can be confusing, proxy-based

**Why not chosen**: Zustand's explicit approach is easier to understand and debug.

### Jotai

**Pros**: Atomic state, minimal API
**Cons**: Different mental model, less suitable for grouped state

**Why not chosen**: Domain-based stores (servers, policies) fit Zustand better.

### React Context + useReducer

**Pros**: No dependencies, built into React
**Cons**: More boilerplate, performance concerns with large state, no devtools

**Why not chosen**: Would need to build features that Zustand provides out of the box.

### Recoil

**Pros**: Facebook-backed, atoms/selectors model
**Cons**: Larger bundle, complex for simple cases, uncertain future

**Why not chosen**: Less active development, Zustand is simpler.
