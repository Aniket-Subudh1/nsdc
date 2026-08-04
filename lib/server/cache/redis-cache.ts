import { createHash } from "node:crypto";

import { getEnv, resolveQueueDriverKind, resolveRedisKeyPrefix } from "@/lib/server/env";
import { getSharedRedisConnection } from "@/lib/server/queue/redis-client";
import type { AuthSession } from "@/lib/server/services/session";

type MemoryEntry = {
  expiresAt: number;
  value: string;
};

const memoryStore = new Map<string, MemoryEntry>();
const MEMORY_MAX_ENTRIES = 500;

function pruneMemoryStore() {
  if (memoryStore.size <= MEMORY_MAX_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }

  while (memoryStore.size > MEMORY_MAX_ENTRIES) {
    const oldest = memoryStore.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    memoryStore.delete(oldest);
  }
}

function readCacheEnv() {
  try {
    return getEnv();
  } catch {
    return null;
  }
}

function useRedisBackend() {
  const env = readCacheEnv();
  if (!env) {
    return false;
  }

  return resolveQueueDriverKind(env) === "redis" && Boolean(env.REDIS_URL.trim());
}

function resolveKeyPrefix() {
  const env = readCacheEnv();
  if (env) {
    return resolveRedisKeyPrefix(env);
  }

  const appEnv = process.env.APP_ENV?.trim() || "test";
  return process.env.REDIS_KEY_PREFIX?.trim() || `nsdc:${appEnv}:`;
}

/** TTL seconds with schema defaults when full env is unavailable (e.g. unit tests). */
export function resolveCacheTtlSeconds(kind: "dashboard" | "options" | "analytics") {
  const env = readCacheEnv();
  if (!env) {
    if (kind === "dashboard") return 45;
    if (kind === "analytics") return 120;
    return 300;
  }

  if (kind === "dashboard") return env.CACHE_DASHBOARD_TTL_SEC;
  if (kind === "analytics") return env.CACHE_ANALYTICS_TTL_SEC;
  return env.CACHE_OPTIONS_TTL_SEC;
}

export function buildCacheScope(actor: AuthSession) {
  if (actor.user.roles.includes("platform_admin")) {
    return "platform";
  }

  return [...actor.user.centerIds].sort().join(",") || "none";
}

export function hashCacheParams(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex").slice(0, 16);
}

export function buildCacheKey(name: string, scope: string, params?: unknown) {
  const prefix = resolveKeyPrefix();
  const paramsHash = params === undefined ? "default" : hashCacheParams(params);
  return `${prefix}cache:${name}:${scope}:${paramsHash}`;
}

async function memoryGet(key: string) {
  const entry = memoryStore.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }

  return entry.value;
}

async function memorySet(key: string, value: string, ttlSeconds: number) {
  if (ttlSeconds <= 0) {
    return;
  }

  memoryStore.set(key, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    value,
  });
  pruneMemoryStore();
}

async function memoryDeleteByPrefix(prefix: string) {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix) || key.includes(`:${prefix}`) || key.includes(`cache:${prefix}`)) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Read-through JSON cache. Uses Redis when the queue driver is redis; otherwise an
 * in-process TTL map so local/mongo-driver modes still get fast repeated reads.
 */
export async function cachedJson<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  if (ttlSeconds <= 0) {
    return loader();
  }

  if (useRedisBackend()) {
    try {
      const env = readCacheEnv();
      if (!env) {
        throw new Error("Redis cache env unavailable");
      }

      const redis = getSharedRedisConnection(env);
      const hit = await redis.get(key);
      if (hit) {
        return JSON.parse(hit) as T;
      }

      const value = await loader();
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      return value;
    } catch (error) {
      console.error("[cache] redis cachedJson failed, falling back to loader", error);
      return loader();
    }
  }

  const hit = await memoryGet(key);
  if (hit) {
    return JSON.parse(hit) as T;
  }

  const value = await loader();
  await memorySet(key, JSON.stringify(value), ttlSeconds);
  return value;
}

/** Best-effort invalidation by exact keys and/or logical name prefixes (e.g. "dash", "options"). */
export async function invalidateCacheKeys(input: { keys?: string[]; prefixes?: string[] }) {
  const keys = input.keys ?? [];
  const prefixes = input.prefixes ?? [];

  if (useRedisBackend()) {
    try {
      const env = readCacheEnv();
      if (!env) {
        throw new Error("Redis cache env unavailable");
      }

      const redis = getSharedRedisConnection(env);
      const keyPrefix = resolveRedisKeyPrefix(env);

      if (keys.length > 0) {
        await redis.del(...keys);
      }

      for (const logical of prefixes) {
        const match = `${keyPrefix}cache:${logical}:*`;
        let cursor = "0";
        do {
          const [nextCursor, found] = await redis.scan(cursor, "MATCH", match, "COUNT", 100);
          cursor = nextCursor;
          if (found.length > 0) {
            await redis.del(...found);
          }
        } while (cursor !== "0");
      }

      return;
    } catch (error) {
      console.error("[cache] redis invalidate failed", error);
    }
  }

  for (const key of keys) {
    memoryStore.delete(key);
  }

  for (const logical of prefixes) {
    await memoryDeleteByPrefix(logical);
  }
}

export async function invalidateDashboardCache() {
  await invalidateCacheKeys({ prefixes: ["dash"] });
}

export async function invalidateOptionsCache() {
  await invalidateCacheKeys({ prefixes: ["options"] });
}

export function resetMemoryCacheForTests() {
  memoryStore.clear();
}
