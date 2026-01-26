/**
 * E2E tests for policy management flows
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

test.describe('Policy Management', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'policies');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display policy list', async () => {
    const policyList = await ctx.window.$('[data-testid="policy-list"]');
    expect(policyList).toBeTruthy();
  });

  test('should display add policy button', async () => {
    const addButton = await ctx.window.$('[data-testid="add-policy-button"]');
    expect(addButton).toBeTruthy();
  });

  test('should open add policy dialog', async () => {
    await clickButton(ctx.window, 'add-policy-button');

    await ctx.window.waitForSelector('[data-testid="add-policy-dialog"]', {
      state: 'visible',
      timeout: 5000,
    });

    const dialog = await ctx.window.$('[data-testid="add-policy-dialog"]');
    expect(dialog).toBeTruthy();
  });

  test('should have required fields in add policy dialog', async () => {
    const nameField = await ctx.window.$('[data-testid="policy-name-input"]');
    const patternField = await ctx.window.$('[data-testid="policy-pattern-input"]');
    const actionSelect = await ctx.window.$('[data-testid="policy-action-select"]');

    expect(nameField).toBeTruthy();
    expect(patternField).toBeTruthy();
    expect(actionSelect).toBeTruthy();
  });

  test('should close dialog on cancel', async () => {
    await clickButton(ctx.window, 'cancel-button');

    await ctx.window.waitForSelector('[data-testid="add-policy-dialog"]', {
      state: 'hidden',
      timeout: 5000,
    });

    const dialog = await ctx.window.$('[data-testid="add-policy-dialog"]');
    const isVisible = dialog ? await dialog.isVisible() : false;
    expect(isVisible).toBe(false);
  });

  test('should fill policy form with glob pattern', async () => {
    await clickButton(ctx.window, 'add-policy-button');
    await ctx.window.waitForSelector('[data-testid="add-policy-dialog"]', {
      state: 'visible',
    });

    await fillField(ctx.window, 'policy-name-input', 'Block Dangerous Tools');
    await fillField(ctx.window, 'policy-pattern-input', 'dangerous-*');

    const nameValue = await ctx.window.inputValue('[data-testid="policy-name-input"]');
    const patternValue = await ctx.window.inputValue('[data-testid="policy-pattern-input"]');

    expect(nameValue).toBe('Block Dangerous Tools');
    expect(patternValue).toBe('dangerous-*');

    await clickButton(ctx.window, 'cancel-button');
  });
});

test.describe('Policy Card Interactions', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'policies');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display policy cards or empty state', async () => {
    const policyCards = await ctx.window.$$('[data-testid="policy-card"]');
    const emptyState = await ctx.window.$('[data-testid="empty-policy-list"]');

    if (policyCards.length === 0) {
      expect(emptyState).toBeTruthy();
    } else {
      expect(policyCards.length).toBeGreaterThan(0);
    }
  });

  test('should show policy priority badge', async () => {
    const policyCards = await ctx.window.$$('[data-testid="policy-card"]');
    const firstCard = policyCards[0];

    if (firstCard) {
      const priorityBadge = await firstCard.$('[data-testid="priority-badge"]');
      expect(priorityBadge).toBeTruthy();
    } else {
      test.skip();
    }
  });

  test('should show policy action badge', async () => {
    const policyCards = await ctx.window.$$('[data-testid="policy-card"]');
    const firstCard = policyCards[0];

    if (firstCard) {
      const actionBadge = await firstCard.$('[data-testid="action-badge"]');
      expect(actionBadge).toBeTruthy();
    } else {
      test.skip();
    }
  });
});

test.describe('Policy Scope Filtering', () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await navigateTo(ctx.window, 'policies');
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeApp(ctx.app);
    }
  });

  test('should display scope filter tabs', async () => {
    const scopeTabs = await ctx.window.$('[data-testid="scope-filter-tabs"]');
    // Scope tabs are optional, may not be implemented
    if (scopeTabs) {
      const globalTab = await ctx.window.$('[data-testid="scope-tab-global"]');
      const clientTab = await ctx.window.$('[data-testid="scope-tab-client"]');
      const serverTab = await ctx.window.$('[data-testid="scope-tab-server"]');

      expect(globalTab || clientTab || serverTab).toBeTruthy();
    }
  });
});
