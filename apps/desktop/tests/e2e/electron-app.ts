/**
 * Electron app test utilities
 * Provides helpers for launching and interacting with the Electron app
 */
import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

export interface AppContext {
  app: ElectronApplication;
  window: Page;
}

/**
 * Launch the Electron application for testing
 */
export async function launchApp(): Promise<AppContext> {
  const appPath = path.resolve(__dirname, '../../');

  const app = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_ENABLE_LOGGING: '1',
    },
  });

  const window = await app.firstWindow();

  // Wait for the app to be ready
  await window.waitForLoadState('domcontentloaded');

  return { app, window };
}

/**
 * Close the Electron application
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

/**
 * Wait for the main content to be visible
 */
export async function waitForAppReady(window: Page): Promise<void> {
  await window.waitForSelector('[data-testid="main-layout"]', {
    state: 'visible',
    timeout: 30000,
  });
}

/**
 * Navigate to a specific section using sidebar
 */
export async function navigateTo(
  window: Page,
  section: 'servers' | 'policies' | 'approvals' | 'settings'
): Promise<void> {
  const testId = `nav-${section}`;
  await window.click(`[data-testid="${testId}"]`);
  await window.waitForTimeout(500); // Allow for transition
}

/**
 * Get element text content
 */
export async function getText(window: Page, selector: string): Promise<string | null> {
  const element = await window.$(selector);
  if (!element) return null;
  return element.textContent();
}

/**
 * Check if element exists and is visible
 */
export async function isVisible(window: Page, selector: string): Promise<boolean> {
  const element = await window.$(selector);
  if (!element) return false;
  return element.isVisible();
}

/**
 * Fill a form field
 */
export async function fillField(
  window: Page,
  testId: string,
  value: string
): Promise<void> {
  await window.fill(`[data-testid="${testId}"]`, value);
}

/**
 * Click a button by test ID
 */
export async function clickButton(window: Page, testId: string): Promise<void> {
  await window.click(`[data-testid="${testId}"]`);
}

/**
 * Wait for a toast notification
 */
export async function waitForToast(
  window: Page,
  text?: string
): Promise<void> {
  if (text) {
    await window.waitForSelector(`text=${text}`, { timeout: 5000 });
  } else {
    await window.waitForSelector('[data-testid="toast"]', { timeout: 5000 });
  }
}
