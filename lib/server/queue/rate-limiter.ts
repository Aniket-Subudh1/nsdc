import { setTimeout as delay } from "node:timers/promises";

import type { Redis } from "ioredis";

export interface RateLimiter {
  /** Resolves once a token is available. May wait; never throws for backpressure. */
  acquire(): Promise<void>;
}

/**
 * Atomic Redis token bucket. Shared across every worker process (and every EC2 instance,
 * if scaled horizontally) hitting the same key, so the configured SIDH_RATE_LIMIT_PER_SEC
 * is a true ceiling on outbound SIDH calls regardless of how many workers are running.
 */
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsedSec = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + elapsedSec * refillPerSec)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "ts", now)
redis.call("PEXPIRE", key, 60000)

return allowed
`;

export function createRedisRateLimiter(redis: Redis, key: string, ratePerSec: number): RateLimiter {
  const capacity = Math.max(1, ratePerSec);
  const retryDelayMs = Math.max(10, Math.ceil(1000 / capacity));

  async function tryAcquire(): Promise<boolean> {
    const allowed = (await redis.eval(TOKEN_BUCKET_SCRIPT, 1, key, capacity, ratePerSec, Date.now())) as number;
    return allowed === 1;
  }

  return {
    async acquire() {
      for (;;) {
        if (await tryAcquire()) {
          return;
        }

        await delay(retryDelayMs);
      }
    },
  };
}

/** Single-process token bucket used in dev / Mongo-only mode. */
export function createInMemoryRateLimiter(ratePerSec: number): RateLimiter {
  const capacity = Math.max(1, ratePerSec);
  const retryDelayMs = Math.max(10, Math.ceil(1000 / capacity));
  let tokens = capacity;
  let lastRefillAt = Date.now();

  function refill() {
    const now = Date.now();
    const elapsedSec = (now - lastRefillAt) / 1000;

    if (elapsedSec > 0) {
      tokens = Math.min(capacity, tokens + elapsedSec * ratePerSec);
      lastRefillAt = now;
    }
  }

  return {
    async acquire() {
      for (;;) {
        refill();

        if (tokens >= 1) {
          tokens -= 1;
          return;
        }

        await delay(retryDelayMs);
      }
    },
  };
}
