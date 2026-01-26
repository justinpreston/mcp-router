import type { Container } from 'inversify';
import { registerAppHandlers, registerWindowHandlers } from './app.handler';
import { registerServerHandlers } from './servers.handler';
import { registerTokenHandlers } from './tokens.handler';
import { registerPolicyHandlers } from './policies.handler';
import { registerApprovalHandlers, setupApprovalNotifications } from './approvals.handler';
import { registerWorkspaceHandlers } from './workspaces.handler';
import { registerProjectHandlers } from './projects.handler';
import { registerWorkflowHandlers } from './workflows.handler';
import { registerMemoryHandlers } from './memory.handler';
import { registerCatalogHandlers } from './catalog.handler';

export { registerAppHandlers, registerWindowHandlers } from './app.handler';
export { registerServerHandlers } from './servers.handler';
export { registerTokenHandlers } from './tokens.handler';
export { registerPolicyHandlers } from './policies.handler';
export { registerApprovalHandlers, setupApprovalNotifications } from './approvals.handler';
export { registerWorkspaceHandlers } from './workspaces.handler';
export { registerProjectHandlers } from './projects.handler';
export { registerWorkflowHandlers } from './workflows.handler';
export { registerMemoryHandlers } from './memory.handler';
export { registerCatalogHandlers } from './catalog.handler';
export * from './validation-schemas';

/**
 * Register all IPC handlers for main-renderer communication.
 * This should be called during app initialization after the DI container is set up.
 *
 * @param container The InversifyJS DI container
 */
export function registerAllIpcHandlers(container: Container): void {
  // App and window handlers
  registerAppHandlers(container);
  registerWindowHandlers(container);

  // Domain handlers
  registerServerHandlers(container);
  registerTokenHandlers(container);
  registerPolicyHandlers(container);
  registerApprovalHandlers(container);
  registerWorkspaceHandlers(container);
  registerProjectHandlers(container);
  registerWorkflowHandlers(container);
  registerMemoryHandlers(container);
  registerCatalogHandlers(container);

  // Setup background tasks
  setupApprovalNotifications(container);
}
