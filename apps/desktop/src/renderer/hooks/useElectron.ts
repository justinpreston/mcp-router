import { useCallback, useEffect, useRef } from 'react';
import type { ElectronAPI } from '@preload/api';

/**
 * Get the Electron API from the window object.
 * Returns undefined if not running in Electron.
 */
export function getElectronAPI(): ElectronAPI | undefined {
  if (typeof window !== 'undefined' && 'electron' in window) {
    return window.electron;
  }
  return undefined;
}

/**
 * Hook to access the Electron API.
 * Throws an error if not running in Electron.
 */
export function useElectron(): ElectronAPI {
  const api = getElectronAPI();
  if (!api) {
    throw new Error('Electron API not available. Are you running in Electron?');
  }
  return api;
}

/**
 * Hook to safely access the Electron API.
 * Returns null if not running in Electron.
 */
export function useElectronSafe(): ElectronAPI | null {
  return getElectronAPI() ?? null;
}

/**
 * Hook to subscribe to Electron IPC events.
 * Automatically unsubscribes when the component unmounts.
 */
export function useElectronEvent<T = unknown>(
  channel: string,
  callback: (data: T) => void
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsubscribe = api.on(channel, (...args: unknown[]) => {
      callbackRef.current(args[0] as T);
    });

    return unsubscribe;
  }, [channel]);
}

/**
 * Hook to get app information.
 */
export function useAppInfo() {
  const api = useElectronSafe();

  const getVersion = useCallback(async () => {
    return api?.app.getVersion() ?? 'unknown';
  }, [api]);

  const getPlatform = useCallback(async () => {
    return api?.app.getPlatform() ?? 'unknown';
  }, [api]);

  return { getVersion, getPlatform };
}

/**
 * Hook for window controls.
 */
export function useWindowControls() {
  const api = useElectronSafe();

  const minimize = useCallback(() => {
    api?.window.minimize();
  }, [api]);

  const maximize = useCallback(() => {
    api?.window.maximize();
  }, [api]);

  const close = useCallback(() => {
    api?.window.close();
  }, [api]);

  return { minimize, maximize, close };
}
