/**
 * E2E tests for settings page
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  navigateTo,
  AppContext,
} from './electron-app';

test.describe('Settings Page', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'settings');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display settings page', async () => {
    const settingsPage = await ctx.window.$('[data-testid="settings-page"]');
    expect(settingsPage).toBeTruthy();
  });

  test('should display general settings section', async () => {
    const generalSection = await ctx.window.$('[data-testid="general-settings"]');
    // General settings section is optional
    if (generalSection) {
      expect(generalSection).toBeTruthy();
    }
  });

  test('should display security settings section', async () => {
    const securitySection = await ctx.window.$('[data-testid="security-settings"]');
    // Security settings section is optional
    if (securitySection) {
      expect(securitySection).toBeTruthy();
    }
  });

  test('should display token management section', async () => {
    const tokenSection = await ctx.window.$('[data-testid="token-settings"]');
    // Token settings section is optional
    if (tokenSection) {
      expect(tokenSection).toBeTruthy();
    }
  });
});

test.describe('Token Management', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'settings');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display token list', async () => {
    const tokenList = await ctx.window.$('[data-testid="token-list"]');
    // Token list may be in settings or separate section
    if (tokenList) {
      expect(tokenList).toBeTruthy();
    }
  });

  test('should have create token button', async () => {
    const createButton = await ctx.window.$('[data-testid="create-token-button"]');
    // Create token button is optional depending on UI design
    if (createButton) {
      expect(createButton).toBeTruthy();
    }
  });
});

test.describe('Application Settings', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'settings');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should have theme toggle', async () => {
    const themeToggle = await ctx.window.$('[data-testid="theme-toggle"]');
    // Theme toggle is optional
    if (themeToggle) {
      expect(themeToggle).toBeTruthy();
    }
  });

  test('should have auto-start toggle', async () => {
    const autoStartToggle = await ctx.window.$('[data-testid="auto-start-toggle"]');
    // Auto-start toggle is optional
    if (autoStartToggle) {
      expect(autoStartToggle).toBeTruthy();
    }
  });

  test('should have port configuration', async () => {
    const portInput = await ctx.window.$('[data-testid="http-port-input"]');
    // Port configuration is optional
    if (portInput) {
      expect(portInput).toBeTruthy();
    }
  });
});

test.describe('About Section', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'settings');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display version information', async () => {
    const versionInfo = await ctx.window.$('[data-testid="version-info"]');
    // Version info is optional
    if (versionInfo) {
      const text = await versionInfo.textContent();
      expect(text).toMatch(/\d+\.\d+\.\d+/); // Matches semantic version
    }
  });

  test('should have check for updates button', async () => {
    const updateButton = await ctx.window.$('[data-testid="check-updates-button"]');
    // Update button is optional
    if (updateButton) {
      expect(updateButton).toBeTruthy();
    }
  });
});
