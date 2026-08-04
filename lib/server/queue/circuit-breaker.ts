import type { Redis } from "ioredis";

export type CircuitBreakerOptions = {
  failureThreshold: number;
  minSamples: number;
  cooldownMs: number;
  windowMs?: number;
};

export interface CircuitBreaker {
  isOpen(): Promise<boolean>;
  recordSuccess(): Promise<void>;
  recordFailure(): Promise<void>;
}

const DEFAULT_WINDOW_MS = 30_000;

const RECORD_OUTCOME_SCRIPT = `
local counterKey = KEYS[1]
local openKey = KEYS[2]
local isFailure = ARGV[1] == "0"
local windowMs = tonumber(ARGV[2])
local minSamples = tonumber(ARGV[3])
local thresholdPermille = tonumber(ARGV[4])
local cooldownMs = tonumber(ARGV[5])

local total = redis.call("HINCRBY", counterKey, "total", 1)
local failures = 0

if isFailure then
  failures = redis.call("HINCRBY", counterKey, "failures", 1)
else
  local existing = redis.call("HGET", counterKey, "failures")
  failures = tonumber(existing) or 0
end

if total == 1 then
  redis.call("PEXPIRE", counterKey, windowMs)
end

if total >= minSamples and (failures * 1000 / total) >= thresholdPermille then
  redis.call("SET", openKey, "1", "PX", cooldownMs)
end

return 1
`;

export function createRedisCircuitBreaker(redis: Redis, keyPrefix: string, options: CircuitBreakerOptions): CircuitBreaker {
  const counterKey = `${keyPrefix}{sidh:circuit}:counters`;
  const openKey = `${keyPrefix}{sidh:circuit}:open`;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const thresholdPermille = Math.round(options.failureThreshold * 1000);

  async function record(outcome: "0" | "1") {
    await redis.eval(RECORD_OUTCOME_SCRIPT, 2, counterKey, openKey, outcome, windowMs, options.minSamples, thresholdPermille, options.cooldownMs);
  }

  return {
    async isOpen() {
      const flag = await redis.exists(openKey);
      return flag === 1;
    },
    async recordSuccess() {
      await record("1");
    },
    async recordFailure() {
      await record("0");
    },
  };
}

type InMemoryState = {
  failures: number;
  total: number;
  windowStartedAt: number;
  openUntil: number;
};

export function createInMemoryCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const state: InMemoryState = { failures: 0, openUntil: 0, total: 0, windowStartedAt: Date.now() };

  function rollWindowIfExpired() {
    const now = Date.now();
    if (now - state.windowStartedAt > windowMs) {
      state.failures = 0;
      state.total = 0;
      state.windowStartedAt = now;
    }
  }

  return {
    async isOpen() {
      return Date.now() < state.openUntil;
    },
    async recordSuccess() {
      rollWindowIfExpired();
      state.total += 1;
    },
    async recordFailure() {
      rollWindowIfExpired();
      state.total += 1;
      state.failures += 1;

      if (state.total >= options.minSamples && state.failures / state.total >= options.failureThreshold) {
        state.openUntil = Date.now() + options.cooldownMs;
      }
    },
  };
}
