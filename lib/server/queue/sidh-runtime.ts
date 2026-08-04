import { getEnv, resolveQueueDriverKind, resolveRedisKeyPrefix } from "@/lib/server/env";
import { createInMemoryCircuitBreaker, createRedisCircuitBreaker, type CircuitBreaker } from "@/lib/server/queue/circuit-breaker";
import { createInMemoryRateLimiter, createRedisRateLimiter, type RateLimiter } from "@/lib/server/queue/rate-limiter";
import { getSharedRedisConnection } from "@/lib/server/queue/redis-client";
import { createRedisSidhSessionStore } from "@/lib/server/queue/sidh-session-store";
import { createInMemorySidhSessionStore, createSidhConnector, type SidhSessionStore } from "@/lib/server/services/sidh-connector";

export type SidhRuntime = {
  circuitBreaker: CircuitBreaker;
  connector: ReturnType<typeof createSidhConnector>;
  rateLimiter: RateLimiter;
};

const globalRuntime = globalThis as typeof globalThis & {
  __nsdcSidhRuntime?: SidhRuntime;
};

/**
 * Wires up the SIDH connector together with the rate limiter, circuit breaker, and auth
 * session store that match the active queue driver. In Redis mode all three are shared
 * across every concurrent worker via Redis; in Mongo/dev mode they fall back to
 * single-process in-memory implementations with identical semantics.
 */
export function getSidhRuntime(): SidhRuntime {
  if (!globalRuntime.__nsdcSidhRuntime) {
    const env = getEnv();
    const driverKind = resolveQueueDriverKind(env);

    const breakerOptions = {
      cooldownMs: env.SIDH_CIRCUIT_BREAKER_COOLDOWN_MS,
      failureThreshold: env.SIDH_CIRCUIT_BREAKER_THRESHOLD,
      minSamples: env.SIDH_CIRCUIT_BREAKER_MIN_SAMPLES,
    };

    let sessionStore: SidhSessionStore;
    let rateLimiter: RateLimiter;
    let circuitBreaker: CircuitBreaker;

    if (driverKind === "redis") {
      const redis = getSharedRedisConnection(env);
      const keyPrefix = resolveRedisKeyPrefix(env);
      sessionStore = createRedisSidhSessionStore(redis, keyPrefix);
      rateLimiter = createRedisRateLimiter(redis, `${keyPrefix}sidh:ratelimit`, env.SIDH_RATE_LIMIT_PER_SEC);
      circuitBreaker = createRedisCircuitBreaker(redis, keyPrefix, breakerOptions);
    } else {
      sessionStore = createInMemorySidhSessionStore();
      rateLimiter = createInMemoryRateLimiter(env.SIDH_RATE_LIMIT_PER_SEC);
      circuitBreaker = createInMemoryCircuitBreaker(breakerOptions);
    }

    globalRuntime.__nsdcSidhRuntime = {
      circuitBreaker,
      connector: createSidhConnector({ env, sessionStore }),
      rateLimiter,
    };
  }

  return globalRuntime.__nsdcSidhRuntime;
}

export function resetSidhRuntimeForTests() {
  globalRuntime.__nsdcSidhRuntime = undefined;
}
