/**
 * E2E tests for Dashboard feature
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  navigateTo,
  clickButton,
  AppContext,
} from './electron-app';

test.describe('Dashboard', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'servers');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display dashboard components', async () => {
    // Dashboard container
    const dashboard = await ctx.window.$('[data-testid="dashboard"]');
    expect(dashboard).toBeTruthy();

    // Quick actions
    const quickActions = await ctx.window.$('[data-testid="quick-actions"]');
    expect(quickActions).toBeTruthy();

    // Search filter
    const searchFilter = await ctx.window.$('[data-testid="search-filter"]');
    expect(searchFilter).toBeTruthy();
  });

  test('should display server stats', async () => {
    const stats = await ctx.window.$('[data-testid="server-stats"]');
    expect(stats).toBeTruthy();
  });

  test('should have add server button', async () => {
    const addButton = await ctx.window.$('[data-testid="add-server-button"]');
    expect(addButton).toBeTruthy();
  });

  test('should have refresh button', async () => {
    const refreshButton = await ctx.window.$('[data-testid="refresh-button"]');
    expect(refreshButton).toBeTruthy();
  });

  test('should filter servers by search', async () => {
    const searchInput = await ctx.window.$('[data-testid="search-input"]');
    expect(searchInput).toBeTruthy();

    // Type search query
    await ctx.window.fill('[data-testid="search-input"]', 'test');

    // Verify input value
    const value = await ctx.window.inputValue('[data-testid="search-input"]');
    expect(value).toBe('test');

    // Clear search
    await ctx.window.fill('[data-testid="search-input"]', '');
  });

  test('should have status filter dropdown', async () => {
    const statusFilter = await ctx.window.$('[data-testid="status-filter"]');
    expect(statusFilter).toBeTruthy();
  });
});

test.describe('Dashboard Server Interactions', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'servers');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should show server list or empty state', async () => {
    const serverList = await ctx.window.$('[data-testid="server-list"]');
    const emptyState = await ctx.window.$('[data-testid="empty-server-list"]');

    // Either server list or empty state should be visible
    expect(serverList || emptyState).toBeTruthy();
  });

  test('should open add server dialog on button click', async () => {
    await clickButton(ctx.window, 'add-server-button');

    // Wait for dialog to appear
    await ctx.window.waitForSelector('[data-testid="add-server-dialog"]', {
      state: 'visible',
      timeout: 5000,
    });

    const dialog = await ctx.window.$('[data-testid="add-server-dialog"]');
    expect(dialog).toBeTruthy();

    // Close the dialog
    await clickButton(ctx.window, 'cancel-button');
  });

  test('should refresh servers on refresh button click', async () => {
    // Click refresh
    await clickButton(ctx.window, 'refresh-button');

    // Wait a moment for refresh to complete
    await ctx.window.waitForTimeout(500);

    // Verify dashboard is still visible
    const dashboard = await ctx.window.$('[data-testid="dashboard"]');
    expect(dashboard).toBeTruthy();
  });
});
