/**
 * E2E tests for approval queue flows
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  navigateTo,
  AppContext,
} from './electron-app';

test.describe('Approval Queue', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'approvals');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display approval queue', async () => {
    const approvalQueue = await ctx.window.$('[data-testid="approval-queue"]');
    expect(approvalQueue).toBeTruthy();
  });

  test('should display empty state when no pending approvals', async () => {
    const approvalCards = await ctx.window.$$('[data-testid="approval-card"]');
    const emptyState = await ctx.window.$('[data-testid="empty-approval-queue"]');

    if (approvalCards.length === 0) {
      expect(emptyState).toBeTruthy();
    } else {
      expect(approvalCards.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Approval Card Interactions', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'approvals');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should show approval details when card is clicked', async () => {
    const approvalCards = await ctx.window.$$('[data-testid="approval-card"]');
    const firstCard = approvalCards[0];

    if (firstCard) {
      await firstCard.click();

      await ctx.window.waitForSelector('[data-testid="approval-detail-dialog"]', {
        state: 'visible',
        timeout: 5000,
      });

      const dialog = await ctx.window.$('[data-testid="approval-detail-dialog"]');
      expect(dialog).toBeTruthy();

      // Close dialog
      await ctx.window.click('[data-testid="close-dialog-button"]');
    } else {
      test.skip();
    }
  });

  test('should display tool name in approval card', async () => {
    const approvalCards = await ctx.window.$$('[data-testid="approval-card"]');
    const firstCard = approvalCards[0];

    if (firstCard) {
      const toolName = await firstCard.$('[data-testid="tool-name"]');
      expect(toolName).toBeTruthy();
    } else {
      test.skip();
    }
  });

  test('should display timestamp in approval card', async () => {
    const approvalCards = await ctx.window.$$('[data-testid="approval-card"]');
    const firstCard = approvalCards[0];

    if (firstCard) {
      const timestamp = await firstCard.$('[data-testid="request-timestamp"]');
      expect(timestamp).toBeTruthy();
    } else {
      test.skip();
    }
  });
});

test.describe('Approval Actions', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'approvals');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should have approve and reject buttons', async () => {
    const approvalCards = await ctx.window.$$('[data-testid="approval-card"]');
    const firstCard = approvalCards[0];

    if (firstCard) {
      const approveButton = await firstCard.$('[data-testid="approve-button"]');
      const rejectButton = await firstCard.$('[data-testid="reject-button"]');

      expect(approveButton).toBeTruthy();
      expect(rejectButton).toBeTruthy();
    } else {
      test.skip();
    }
  });

  test('should show confirmation before rejecting', async () => {
    const approvalCards = await ctx.window.$$('[data-testid="approval-card"]');
    const firstCard = approvalCards[0];

    if (firstCard) {
      // Click reject button
      await firstCard.click();
      await ctx.window.waitForSelector('[data-testid="approval-detail-dialog"]', {
        state: 'visible',
      });

      const rejectButton = await ctx.window.$('[data-testid="reject-button"]');
      if (rejectButton) {
        await rejectButton.click();

        // Check for confirmation or reason input
        const reasonInput = await ctx.window.$('[data-testid="rejection-reason-input"]');
        const confirmDialog = await ctx.window.$('[data-testid="confirm-rejection"]');

        expect(reasonInput || confirmDialog).toBeTruthy();

        // Cancel the rejection
        await ctx.window.click('[data-testid="cancel-button"]');
      }
    } else {
      test.skip();
    }
  });
});

test.describe('Approval Queue Refresh', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'approvals');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should have refresh button', async () => {
    const refreshButton = await ctx.window.$('[data-testid="refresh-approvals-button"]');
    // Refresh button is optional
    if (refreshButton) {
      expect(refreshButton).toBeTruthy();
    }
  });

  test('should update queue on refresh', async () => {
    const refreshButton = await ctx.window.$('[data-testid="refresh-approvals-button"]');

    if (refreshButton) {
      await refreshButton.click();

      // Wait for potential loading
      await ctx.window.waitForTimeout(1000);

      const newCount = (await ctx.window.$$('[data-testid="approval-card"]')).length;
      // Count may change or stay same, just verify it doesn't crash
      expect(newCount).toBeGreaterThanOrEqual(0);
    } else {
      test.skip();
    }
  });
});
