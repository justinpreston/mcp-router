import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '../rate-limiter.service';

describe('TokenBucketRateLimiter', () => {
  let rateLimiter: TokenBucketRateLimiter;

  beforeEach(() => {
    rateLimiter = new TokenBucketRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('check', () => {
    it('should allow requests when bucket is full', () => {
      const result = rateLimiter.check('test-key');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100); // default capacity
    });

    it('should return correct remaining tokens', () => {
      // Consume some tokens first
      rateLimiter.consume('test-key', 30);

      const result = rateLimiter.check('test-key');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(70);
    });

    it('should not allow when bucket is empty', () => {
      // Consume all tokens
      rateLimiter.consume('test-key', 100);

      const result = rateLimiter.check('test-key');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });
  });

  describe('consume', () => {
    it('should consume single token by default', () => {
      const result = rateLimiter.consume('test-key');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should consume multiple tokens', () => {
      const result = rateLimiter.consume('test-key', 10);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(90);
    });

    it('should deny when insufficient tokens', () => {
      // First consume most tokens
      rateLimiter.consume('test-key', 95);

      // Try to consume more than remaining
      const result = rateLimiter.consume('test-key', 10);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(5);
    });

    it('should not deduct tokens when denied', () => {
      // Consume most tokens
      rateLimiter.consume('test-key', 98);

      // Try to consume more than remaining
      rateLimiter.consume('test-key', 10);

      // Check remaining
      const result = rateLimiter.check('test-key');
      expect(result.remaining).toBe(2); // Should still have 2 tokens
    });

    it('should track different keys separately', () => {
      rateLimiter.consume('key-1', 50);
      rateLimiter.consume('key-2', 30);

      const result1 = rateLimiter.check('key-1');
      const result2 = rateLimiter.check('key-2');

      expect(result1.remaining).toBe(50);
      expect(result2.remaining).toBe(70);
    });
  });

  describe('refill', () => {
    it('should refill tokens over time', () => {
      // Consume all tokens
      rateLimiter.consume('test-key', 100);

      // Advance time by 1 second (default refill rate: 10 tokens per second)
      vi.advanceTimersByTime(1000);

      const result = rateLimiter.check('test-key');

      expect(result.remaining).toBe(10);
    });

    it('should not exceed capacity', () => {
      // Start with full bucket
      const initial = rateLimiter.check('test-key');
      expect(initial.remaining).toBe(100);

      // Advance time (should not exceed capacity)
      vi.advanceTimersByTime(10000);

      const result = rateLimiter.check('test-key');
      expect(result.remaining).toBe(100);
    });

    it('should refill partially based on elapsed time', () => {
      // Consume all tokens
      rateLimiter.consume('test-key', 100);

      // Advance time by 500ms (should add 5 tokens at 10/sec)
      vi.advanceTimersByTime(500);

      const result = rateLimiter.check('test-key');
      expect(result.remaining).toBe(5);
    });
  });

  describe('reset', () => {
    it('should restore bucket to full capacity', () => {
      // Consume some tokens
      rateLimiter.consume('test-key', 80);

      // Reset
      rateLimiter.reset('test-key');

      const result = rateLimiter.check('test-key');
      expect(result.remaining).toBe(100);
    });
  });

  describe('configure', () => {
    it('should allow custom configuration per key', () => {
      rateLimiter.configure('custom-key', {
        capacity: 50,
        refillRate: 5,
        refillInterval: 1000,
      });

      const result = rateLimiter.check('custom-key');

      expect(result.remaining).toBe(50);
    });

    it('should use custom refill rate', () => {
      rateLimiter.configure('custom-key', {
        capacity: 100,
        refillRate: 20, // 20 tokens per second
        refillInterval: 1000,
      });

      // Consume all tokens
      rateLimiter.consume('custom-key', 100);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      const result = rateLimiter.check('custom-key');
      expect(result.remaining).toBe(20);
    });
  });

  describe('getConfig', () => {
    it('should return configured settings', () => {
      rateLimiter.configure('custom-key', {
        capacity: 200,
        refillRate: 25,
        refillInterval: 2000,
      });

      const config = rateLimiter.getConfig('custom-key');

      expect(config).toEqual({
        capacity: 200,
        refillRate: 25,
        refillInterval: 2000,
      });
    });

    it('should return undefined for unconfigured key', () => {
      const config = rateLimiter.getConfig('unconfigured-key');

      expect(config).toBeUndefined();
    });
  });

  describe('retryAfter', () => {
    it('should provide correct retry time when denied', () => {
      // Configure with known values
      rateLimiter.configure('test-key', {
        capacity: 10,
        refillRate: 1, // 1 token per interval
        refillInterval: 1000, // 1 second
      });

      // Consume all tokens
      rateLimiter.consume('test-key', 10);

      // Try to consume
      const result = rateLimiter.consume('test-key', 1);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(1000); // 1 second to get 1 token
    });

    it('should calculate correct retry time for multiple tokens', () => {
      rateLimiter.configure('test-key', {
        capacity: 10,
        refillRate: 2, // 2 tokens per interval
        refillInterval: 1000,
      });

      // Consume all tokens
      rateLimiter.consume('test-key', 10);

      // Try to consume 5 tokens
      const result = rateLimiter.consume('test-key', 5);

      expect(result.allowed).toBe(false);
      // Need 5 tokens at 2/sec = 2.5 intervals = 3000ms (rounded up)
      expect(result.retryAfter).toBe(3000);
    });
  });

  describe('resetAt', () => {
    it('should provide correct reset time', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Consume some tokens
      rateLimiter.consume('test-key', 50);

      const result = rateLimiter.check('test-key');

      // resetAt should be in the future
      expect(result.resetAt).toBeGreaterThan(now);
    });
  });
});
