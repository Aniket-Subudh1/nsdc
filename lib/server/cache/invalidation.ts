import { invalidateDashboardCache, invalidateOptionsCache } from "@/lib/server/cache/redis-cache";

export async function bustDashboardAndOptionsCaches() {
  try {
    await Promise.all([invalidateDashboardCache(), invalidateOptionsCache()]);
  } catch (error) {
    console.error("[cache] bustDashboardAndOptionsCaches failed", error);
  }
}

export async function bustDashboardCaches() {
  try {
    await invalidateDashboardCache();
  } catch (error) {
    console.error("[cache] bustDashboardCaches failed", error);
  }
}

export async function bustOptionsCaches() {
  try {
    await invalidateOptionsCache();
  } catch (error) {
    console.error("[cache] bustOptionsCaches failed", error);
  }
}
