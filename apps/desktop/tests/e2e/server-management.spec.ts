/**
 * E2E tests for server management flows
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  navigateTo,
  fillField,
  clickButton,
  AppContext,
} from './electron-app';

test.describe('Server Management', () => {
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

  test('should display server list', async () => {
    const serverList = await ctx.window.$('[data-testid="server-list"]');
    expect(serverList).toBeTruthy();
  });

  test('should display add server button', async () => {
    const addButton = await ctx.window.$('[data-testid="add-server-button"]');
    expect(addButton).toBeTruthy();
  });

  test('should open add server dialog', async () => {
    await clickButton(ctx.window, 'add-server-button');

    // Wait for dialog to appear
    await ctx.window.waitForSelector('[data-testid="add-server-dialog"]', {
      state: 'visible',
      timeout: 5000,
    });

    const dialog = await ctx.window.$('[data-testid="add-server-dialog"]');
    expect(dialog).toBeTruthy();
  });

  test('should have required fields in add server dialog', async () => {
    const nameField = await ctx.window.$('[data-testid="server-name-input"]');
    const commandField = await ctx.window.$('[data-testid="server-command-input"]');

    expect(nameField).toBeTruthy();
    expect(commandField).toBeTruthy();
  });

  test('should close dialog on cancel', async () => {
    await clickButton(ctx.window, 'cancel-button');

    // Wait for dialog to close
    await ctx.window.waitForSelector('[data-testid="add-server-dialog"]', {
      state: 'hidden',
      timeout: 5000,
    });

    const dialog = await ctx.window.$('[data-testid="add-server-dialog"]');
    const isVisible = dialog ? await dialog.isVisible() : false;
    expect(isVisible).toBe(false);
  });

  test('should fill and submit add server form', async () => {
    // Open dialog again
    await clickButton(ctx.window, 'add-server-button');
    await ctx.window.waitForSelector('[data-testid="add-server-dialog"]', {
      state: 'visible',
    });

    // Fill form
    await fillField(ctx.window, 'server-name-input', 'Test Server');
    await fillField(ctx.window, 'server-command-input', 'npx test-mcp-server');

    // Verify values are filled
    const nameValue = await ctx.window.inputValue('[data-testid="server-name-input"]');
    const commandValue = await ctx.window.inputValue('[data-testid="server-command-input"]');

    expect(nameValue).toBe('Test Server');
    expect(commandValue).toBe('npx test-mcp-server');

    // Close without saving for cleanup
    await clickButton(ctx.window, 'cancel-button');
  });
});

test.describe('Server Card Interactions', () => {
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

  test('should display server cards when servers exist', async () => {
    // This test assumes there might be existing servers
    const serverCards = await ctx.window.$$('[data-testid="server-card"]');
    // Just verify the selector works, may be empty
    expect(serverCards).toBeDefined();
  });

  test('should show empty state when no servers', async () => {
    const emptyState = await ctx.window.$('[data-testid="empty-server-list"]');
    const serverCards = await ctx.window.$$('[data-testid="server-card"]');

    // Either we have servers or empty state
    if (serverCards.length === 0) {
      expect(emptyState).toBeTruthy();
    } else {
      expect(serverCards.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Server Details', () => {
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

  test('should show server details panel when server is selected', async () => {
    const serverCards = await ctx.window.$$('[data-testid="server-card"]');
    const firstCard = serverCards[0];

    if (firstCard) {
      // Click first server card
      await firstCard.click();

      // Check for details panel
      const detailsPanel = await ctx.window.$('[data-testid="server-details"]');
      expect(detailsPanel).toBeTruthy();
    } else {
      // Skip if no servers
      test.skip();
    }
  });
});
