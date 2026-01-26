import { injectable } from 'inversify';
import type { IRateLimiter, RateLimitConfig, RateLimitResult } from '@main/core/interfaces';

const DEFAULT_CONFIG: RateLimitConfig = {
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000, // 1 second
};

/**
 * Token bucket rate limiter implementation.
 * Provides per-key rate limiting with configurable capacity and refill rate.
 */
@injectable()
export class TokenBucketRateLimiter implements IRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  check(key: string): RateLimitResult {
    const bucket = this.getOrCreateBucket(key);
    bucket.refill();

    return {
      allowed: bucket.tokens >= 1,
      remaining: Math.floor(bucket.tokens),
      resetAt: bucket.getResetTime(),
      retryAfter: bucket.tokens < 1 ? bucket.getWaitTime(1) : undefined,
    };
  }

  consume(key: string, count: number = 1): RateLimitResult {
    const bucket = this.getOrCreateBucket(key);
    bucket.refill();

    const allowed = bucket.tokens >= count;

    if (allowed) {
      bucket.tokens -= count;
    }

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetAt: bucket.getResetTime(),
      retryAfter: !allowed ? bucket.getWaitTime(count) : undefined,
    };
  }

  reset(key: string): void {
    const config = this.configs.get(key) ?? DEFAULT_CONFIG;
    this.buckets.set(key, new TokenBucket(config));
  }

  configure(key: string, config: RateLimitConfig): void {
    this.configs.set(key, config);
    this.buckets.set(key, new TokenBucket(config));
  }

  getConfig(key: string): RateLimitConfig | undefined {
    return this.configs.get(key);
  }

  /**
   * Get or create a bucket for the given key.
   */
  private getOrCreateBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      const config = this.configs.get(key) ?? DEFAULT_CONFIG;
      bucket = new TokenBucket(config);
      this.buckets.set(key, bucket);
    }

    return bucket;
  }
}

/**
 * Individual token bucket for rate limiting.
 */
class TokenBucket {
  tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly refillInterval: number;

  constructor(config: RateLimitConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.refillInterval = config.refillInterval;
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time.
   */
  refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervals = Math.floor(elapsed / this.refillInterval);

    if (intervals > 0) {
      const refillAmount = intervals * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + refillAmount);
      this.lastRefill = now - (elapsed % this.refillInterval);
    }
  }

  /**
   * Get the time until the bucket is fully refilled.
   */
  getResetTime(): number {
    const tokensNeeded = this.capacity - this.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate);
    return Date.now() + intervalsNeeded * this.refillInterval;
  }

  /**
   * Get the wait time until `count` tokens are available.
   */
  getWaitTime(count: number): number {
    if (this.tokens >= count) {
      return 0;
    }

    const tokensNeeded = count - this.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate);
    return intervalsNeeded * this.refillInterval;
  }
}
