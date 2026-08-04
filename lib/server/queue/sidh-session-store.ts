import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type { Redis } from "ioredis";

import type { ConnectorSession, SidhSessionStore } from "@/lib/server/services/sidh-connector";

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

/**
 * Redis-backed SIDH session cache shared by every concurrent worker. Without this, raising
 * SIDH_PUSH_CONCURRENCY would make every worker independently notice "no session" at once and
 * all bootstrap (2x CSRF + getkey + login) in parallel, hammering SIDH's login endpoint. The
 * refresh lock guarantees exactly one bootstrap happens; everyone else reuses its result.
 */
export function createRedisSidhSessionStore(redis: Redis, keyPrefix: string, ttlSeconds = 20 * 60): SidhSessionStore {
  const sessionKey = `${keyPrefix}sidh:session`;
  const lockKey = `${keyPrefix}sidh:session:lock`;
  const lockTtlMs = 20_000;
  const maxWaitForLockMs = 15_000;

  async function readCached(): Promise<ConnectorSession | null> {
    const raw = await redis.get(sessionKey);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as ConnectorSession;
    } catch {
      return null;
    }
  }

  async function tryAcquireLock(token: string): Promise<boolean> {
    const result = await redis.set(lockKey, token, "PX", lockTtlMs, "NX");
    return result === "OK";
  }

  async function releaseLock(token: string) {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token).catch(() => undefined);
  }

  return {
    async getCached() {
      return readCached();
    },

    async refresh(bootstrap) {
      const token = randomUUID();
      const deadline = Date.now() + maxWaitForLockMs;
      let holdsLock = await tryAcquireLock(token);

      while (!holdsLock && Date.now() < deadline) {
        await delay(200);

        const cached = await readCached();
        if (cached) {
          return cached;
        }

        holdsLock = await tryAcquireLock(token);
      }

      try {
        // Another worker may have refreshed while we were waiting for the lock.
        const cached = await readCached();
        if (cached) {
          return cached;
        }

        const session = await bootstrap();
        await redis.set(sessionKey, JSON.stringify(session), "EX", ttlSeconds);
        return session;
      } finally {
        if (holdsLock) {
          await releaseLock(token);
        }
      }
    },

    async clear() {
      await redis.del(sessionKey);
    },
  };
}
