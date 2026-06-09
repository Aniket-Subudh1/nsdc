import { getEnv, type AppEnv } from "@/lib/server/env";

const MINUTES_PER_DAY = 24 * 60;
const SECONDS_PER_MINUTE = 60;
const HOURS_PER_DAY = 24;

export function getAccessTokenTtlMinutes(env: AppEnv = getEnv()) {
  return env.ACCESS_TOKEN_TTL_MINUTES ?? env.AUTH_SESSION_TTL_DAYS * MINUTES_PER_DAY;
}

export function getSessionTtlHours(env: AppEnv = getEnv()) {
  return env.SESSION_TTL_HOURS ?? env.AUTH_SESSION_TTL_DAYS * HOURS_PER_DAY;
}

export function getAuthCookieMaxAgeSeconds(env: AppEnv = getEnv()) {
  return getAccessTokenTtlMinutes(env) * SECONDS_PER_MINUTE;
}

export function getSessionExpiresAt(env: AppEnv = getEnv()) {
  return new Date(Date.now() + getSessionTtlHours(env) * 60 * 60 * 1000);
}
