import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type { ILogger, IJsonRpcHandler, JsonRpcMessage } from '@main/core/interfaces';
import { JsonRpcHandler } from '../json-rpc-handler';
import { createMockLogger } from '@tests/utils';

describe('JsonRpcHandler', () => {
  let container: Container;
  let handler: IJsonRpcHandler;
  let mockLogger: ILogger;
  let sentMessages: JsonRpcMessage[];

  beforeEach(() => {
    vi.useFakeTimers();
    container = new Container();
    mockLogger = createMockLogger();
    sentMessages = [];

    container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);
    container.bind<IJsonRpcHandler>(TYPES.JsonRpcHandler).to(JsonRpcHandler);

    handler = container.get<IJsonRpcHandler>(TYPES.JsonRpcHandler);
    handler.setSendFunction((message) => {
      sentMessages.push(message);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sendRequest', () => {
    it('should send a JSON-RPC 2.0 request', async () => {
      const promise = handler.sendRequest('test/method', { key: 'value' });

      // Check that a request was sent
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toMatchObject({
        jsonrpc: '2.0',
        method: 'test/method',
        params: { key: 'value' },
      });
      expect(sentMessages[0].id).toBeDefined();

      // Simulate response
      handler.handleMessage({
        jsonrpc: '2.0',
        id: sentMessages[0].id!,
        result: { success: true },
      });

      const result = await promise;
      expect(result).toEqual({ success: true });
    });

    it('should handle error response', async () => {
      const promise = handler.sendRequest('test/error');

      // Simulate error response
      handler.handleMessage({
        jsonrpc: '2.0',
        id: sentMessages[0].id!,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });

      await expect(promise).rejects.toThrow('Invalid Request');
    });

    it('should timeout if no response received', async () => {
      const promise = handler.sendRequest('test/slow', undefined, 1000);

      // Advance time past timeout
      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow('Request timed out');
    });

    it('should throw if message emitter not set', async () => {
      const newHandler = new JsonRpcHandler(mockLogger);

      await expect(newHandler.sendRequest('test/method')).rejects.toThrow(
        'Message emitter not set'
      );
    });

    it('should use incrementing IDs', async () => {
      handler.sendRequest('method1');
      handler.sendRequest('method2');
      handler.sendRequest('method3');

      const ids = sentMessages.map((m) => m.id);
      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[1]).not.toBe(ids[2]);
    });
  });

  describe('sendNotification', () => {
    it('should send a notification without ID', () => {
      handler.sendNotification('notify/event', { data: 'test' });

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toMatchObject({
        jsonrpc: '2.0',
        method: 'notify/event',
        params: { data: 'test' },
      });
      expect(sentMessages[0].id).toBeUndefined();
    });
  });

  describe('handleMessage', () => {
    it('should resolve pending request on result', async () => {
      const promise = handler.sendRequest('test/method');
      const id = sentMessages[0].id!;

      handler.handleMessage({
        jsonrpc: '2.0',
        id,
        result: 'success',
      });

      await expect(promise).resolves.toBe('success');
    });

    it('should reject pending request on error', async () => {
      const promise = handler.sendRequest('test/method');
      const id = sentMessages[0].id!;

      handler.handleMessage({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: 'Method not found',
          data: { method: 'test/method' },
        },
      });

      await expect(promise).rejects.toThrow('Method not found');
    });

    it('should call notification handler for incoming notifications', () => {
      const notificationHandler = vi.fn();
      handler.onNotification(notificationHandler);

      handler.handleMessage({
        jsonrpc: '2.0',
        method: 'server/notification',
        params: { message: 'hello' },
      });

      expect(notificationHandler).toHaveBeenCalledWith('server/notification', {
        message: 'hello',
      });
    });

    it('should call request handler for incoming requests', async () => {
      const requestHandler = vi.fn().mockResolvedValue({ handled: true });
      handler.onRequest(requestHandler);

      handler.handleMessage({
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'client/request',
        params: { action: 'do' },
      });

      expect(requestHandler).toHaveBeenCalledWith('client/request', {
        action: 'do',
      });
    });

    it('should send response for incoming request', async () => {
      const requestHandler = vi.fn().mockResolvedValue({ done: true });
      handler.onRequest(requestHandler);

      handler.handleMessage({
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'client/request',
        params: {},
      });

      // Wait for async handler
      await vi.waitFor(() => {
        expect(sentMessages.some((m) => m.id === 'req-1' && 'result' in m)).toBe(
          true
        );
      });

      const response = sentMessages.find((m) => m.id === 'req-1' && 'result' in m);
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 'req-1',
        result: { done: true },
      });
    });

    it('should send error response on handler exception', async () => {
      const requestHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      handler.onRequest(requestHandler);

      handler.handleMessage({
        jsonrpc: '2.0',
        id: 'req-err',
        method: 'client/failing',
        params: {},
      });

      // Wait for async handler
      await vi.waitFor(() => {
        expect(sentMessages.some((m) => m.id === 'req-err' && 'error' in m)).toBe(
          true
        );
      });

      const response = sentMessages.find(
        (m) => m.id === 'req-err' && 'error' in m
      ) as any;
      expect(response.error.message).toBe('Handler failed');
    });

    it('should ignore unknown response IDs', () => {
      // This should not throw
      handler.handleMessage({
        jsonrpc: '2.0',
        id: 'unknown-id',
        result: 'ignored',
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown'),
        expect.any(Object)
      );
    });

    it('should handle batch messages', () => {
      const notificationHandler = vi.fn();
      handler.onNotification(notificationHandler);

      // Process multiple messages
      handler.handleMessage({
        jsonrpc: '2.0',
        method: 'event/one',
        params: { n: 1 },
      });

      handler.handleMessage({
        jsonrpc: '2.0',
        method: 'event/two',
        params: { n: 2 },
      });

      expect(notificationHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('close', () => {
    it('should reject all pending requests', async () => {
      const promise1 = handler.sendRequest('method1');
      const promise2 = handler.sendRequest('method2');

      handler.close();

      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
    });
  });

  describe('getPendingCount', () => {
    it('should return count when requests are pending', () => {
      handler.sendRequest('method1');
      handler.sendRequest('method2');

      expect(handler.getPendingCount()).toBe(2);
    });

    it('should return 0 when no requests pending', async () => {
      const promise = handler.sendRequest('method1');
      const id = sentMessages[0].id!;

      handler.handleMessage({
        jsonrpc: '2.0',
        id,
        result: 'done',
      });

      await promise;
      expect(handler.getPendingCount()).toBe(0);
    });
  });
});
