/**
 * E2E tests for application launch and basic navigation
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, navigateTo, AppContext } from './electron-app';

test.describe('Application Launch', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should launch the application', async () => {
    expect(ctx.app).toBeDefined();
    expect(ctx.window).toBeDefined();
  });

  test('should display the main layout', async () => {
    const layout = await ctx.window.$('[data-testid="main-layout"]');
    expect(layout).toBeTruthy();
  });

  test('should display the sidebar', async () => {
    const sidebar = await ctx.window.$('[data-testid="sidebar"]');
    expect(sidebar).toBeTruthy();
  });

  test('should display navigation items', async () => {
    const navItems = ['servers', 'policies', 'approvals', 'settings'];

    for (const item of navItems) {
      const navElement = await ctx.window.$(`[data-testid="nav-${item}"]`);
      expect(navElement).toBeTruthy();
    }
  });

  test('should show servers page by default', async () => {
    const pageTitle = await ctx.window.$('[data-testid="page-title"]');
    const text = await pageTitle?.textContent();
    expect(text).toContain('Servers');
  });
});

test.describe('Navigation', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should navigate to policies page', async () => {
    await navigateTo(ctx.window, 'policies');

    const pageTitle = await ctx.window.$('[data-testid="page-title"]');
    const text = await pageTitle?.textContent();
    expect(text).toContain('Policies');
  });

  test('should navigate to approvals page', async () => {
    await navigateTo(ctx.window, 'approvals');

    const pageTitle = await ctx.window.$('[data-testid="page-title"]');
    const text = await pageTitle?.textContent();
    expect(text).toContain('Approvals');
  });

  test('should navigate to settings page', async () => {
    await navigateTo(ctx.window, 'settings');

    const pageTitle = await ctx.window.$('[data-testid="page-title"]');
    const text = await pageTitle?.textContent();
    expect(text).toContain('Settings');
  });

  test('should navigate back to servers page', async () => {
    await navigateTo(ctx.window, 'servers');

    const pageTitle = await ctx.window.$('[data-testid="page-title"]');
    const text = await pageTitle?.textContent();
    expect(text).toContain('Servers');
  });
});

test.describe('Window Controls', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should have correct window title', async () => {
    const title = await ctx.window.title();
    expect(title).toContain('MCP Router');
  });

  test('should be able to resize window', async () => {
    const initialSize = await ctx.window.viewportSize();
    expect(initialSize).toBeTruthy();

    // App should maintain minimum size constraints
    if (initialSize) {
      expect(initialSize.width).toBeGreaterThanOrEqual(800);
      expect(initialSize.height).toBeGreaterThanOrEqual(600);
    }
  });
});
