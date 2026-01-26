import { ipcMain, BrowserWindow } from 'electron';
import type { Container } from 'inversify';
import type { IApprovalQueue, ILogger, ApprovalRequest } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import type { ApprovalInfo } from '@preload/api';

/**
 * Transform internal ApprovalRequest to API-safe ApprovalInfo.
 */
function toApprovalInfo(request: ApprovalRequest): ApprovalInfo {
  return {
    id: request.id,
    clientId: request.clientId,
    serverId: request.serverId,
    toolName: request.toolName,
    toolArguments: request.toolArguments,
    policyRuleId: request.policyRuleId,
    status: request.status,
    requestedAt: request.requestedAt,
    respondedAt: request.respondedAt,
    respondedBy: request.respondedBy,
    responseNote: request.responseNote,
    expiresAt: request.expiresAt,
  };
}

/**
 * Notify all windows about approval events.
 */
function notifyApprovalEvent(channel: string, data: ApprovalInfo): void {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    window.webContents.send(channel, data);
  }
}

/**
 * Register IPC handlers for approval queue.
 */
export function registerApprovalHandlers(container: Container): void {
  const approvalQueue = container.get<IApprovalQueue>(TYPES.ApprovalQueue);
  const logger = container.get<ILogger>(TYPES.Logger);

  // List pending approvals
  ipcMain.handle('approvals:list', async () => {
    logger.debug('IPC: approvals:list');

    const requests = await approvalQueue.getPendingRequests();
    return requests.map(toApprovalInfo);
  });

  // Approve request
  ipcMain.handle('approvals:approve', async (_event, id: string, note?: string) => {
    logger.debug('IPC: approvals:approve', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid approval request ID');
    }

    await approvalQueue.respond(id, {
      approved: true,
      note: typeof note === 'string' ? note : undefined,
      respondedBy: 'user',
    });

    // Get updated request and notify
    const request = await approvalQueue.getRequest(id);
    if (request) {
      notifyApprovalEvent('approval:resolved', toApprovalInfo(request));
    }
  });

  // Reject request
  ipcMain.handle('approvals:reject', async (_event, id: string, reason?: string) => {
    logger.debug('IPC: approvals:reject', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid approval request ID');
    }

    await approvalQueue.respond(id, {
      approved: false,
      note: typeof reason === 'string' ? reason : undefined,
      respondedBy: 'user',
    });

    // Get updated request and notify
    const request = await approvalQueue.getRequest(id);
    if (request) {
      notifyApprovalEvent('approval:resolved', toApprovalInfo(request));
    }
  });
}

/**
 * Setup approval request notification hook.
 * This should be called during app initialization to notify UI of new approval requests.
 */
export function setupApprovalNotifications(container: Container): void {
  const approvalQueue = container.get<IApprovalQueue>(TYPES.ApprovalQueue);
  const logger = container.get<ILogger>(TYPES.Logger);

  // Hook into approval queue to notify UI when new requests arrive
  // This would be done via event emitter pattern if we had one on the approval queue
  // For now, this is a placeholder for the notification mechanism

  // Clean up expired approvals periodically
  const cleanupInterval = setInterval(async () => {
    try {
      const cleaned = await approvalQueue.cleanupExpired();
      if (cleaned > 0) {
        logger.info('Cleaned up expired approval requests', { count: cleaned });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired approvals', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, 60000); // Every minute

  // Ensure cleanup stops when app quits
  process.on('beforeExit', () => {
    clearInterval(cleanupInterval);
  });
}
